import { ColumnBuilder, SchemaBuilder, TableBuilder } from 'knex';
import { AbstractSqlDriver, Cascade, Configuration, DatabaseSchema, IsSame, ReferenceType } from '..';
import { EntityMetadata, EntityProperty } from '../typings';
import { Utils } from '../utils';
import { Platform } from '../platforms';
import { MetadataStorage } from '../metadata';
import { Column, DatabaseTable } from './DatabaseTable';

export class SchemaGenerator {

  private readonly platform: Platform = this.driver.getPlatform();
  private readonly helper = this.platform.getSchemaHelper()!;
  private readonly connection = this.driver.getConnection();
  private readonly knex = this.connection.getKnex();

  constructor(private readonly driver: AbstractSqlDriver,
              private readonly metadata: MetadataStorage,
              private readonly config: Configuration) { }

  async generate(): Promise<string> {
    const [dropSchema, createSchema] = await Promise.all([
      this.getDropSchemaSQL(false),
      this.getCreateSchemaSQL(false),
    ]);

    return this.wrapSchema(dropSchema + createSchema);
  }

  async createSchema(wrap = true): Promise<void> {
    await this.ensureDatabase();
    const sql = await this.getCreateSchemaSQL(wrap);
    await this.execute(sql);
  }

  async ensureDatabase() {
    const dbName = this.config.get('dbName')!;
    const exists = await this.helper.databaseExists(this.connection, dbName);

    if (!exists) {
      this.config.set('dbName', this.helper.getManagementDbName());
      await this.driver.reconnect();
      await this.createDatabase(dbName);
    }
  }

  async getCreateSchemaSQL(wrap = true): Promise<string> {
    let ret = '';

    for (const meta of Object.values(this.metadata.getAll())) {
      ret += this.dump(this.createTable(meta));
    }

    for (const meta of Object.values(this.metadata.getAll())) {
      ret += this.dump(this.knex.schema.alterTable(meta.collection, table => this.createForeignKeys(table, meta)));
    }

    return this.wrapSchema(ret, wrap);
  }

  async dropSchema(wrap = true, dropMigrationsTable = false, dropDb = false): Promise<void> {
    if (dropDb) {
      const name = this.config.get('dbName')!;
      return this.dropDatabase(name);
    }

    const sql = await this.getDropSchemaSQL(wrap, dropMigrationsTable);
    await this.execute(sql);
  }

  async getDropSchemaSQL(wrap = true, dropMigrationsTable = false): Promise<string> {
    let ret = '';

    for (const meta of Object.values(this.metadata.getAll())) {
      ret += this.dump(this.dropTable(meta.collection), '\n');
    }

    if (dropMigrationsTable) {
      ret += this.dump(this.dropTable(this.config.get('migrations').tableName!), '\n');
    }

    return this.wrapSchema(ret + '\n', wrap);
  }

  async updateSchema(wrap = true): Promise<void> {
    const sql = await this.getUpdateSchemaSQL(wrap);
    await this.execute(sql);
  }

  async getUpdateSchemaSQL(wrap = true): Promise<string> {
    const schema = await DatabaseSchema.create(this.connection, this.helper, this.config);
    let ret = '';

    for (const meta of Object.values(this.metadata.getAll())) {
      ret += this.getUpdateTableSQL(meta, schema);
    }

    for (const meta of Object.values(this.metadata.getAll())) {
      ret += this.getUpdateTableFKsSQL(meta, schema);
    }

    const definedTables = Object.values(this.metadata.getAll()).map(meta => meta.collection);
    const remove = schema.getTables().filter(table => !definedTables.includes(table.name));

    for (const table of remove) {
      ret += this.dump(this.dropTable(table.name));
    }

    return this.wrapSchema(ret, wrap);
  }

  /**
   * creates new database and connects to it
   */
  async createDatabase(name: string): Promise<void> {
    await this.connection.execute(this.helper.getCreateDatabaseSQL('' + this.knex.ref(name)));
    this.config.set('dbName', name);
    await this.driver.reconnect();
  }

  async dropDatabase(name: string): Promise<void> {
    this.config.set('dbName', this.helper.getManagementDbName());
    await this.driver.reconnect();
    await this.connection.execute(this.helper.getDropDatabaseSQL('' + this.knex.ref(name)));
  }

  async execute(sql: string) {
    const lines = sql.split('\n').filter(i => i.trim());

    for (const line of lines) {
      await this.connection.execute(line);
    }
  }

  private getUpdateTableSQL(meta: EntityMetadata, schema: DatabaseSchema): string {
    const table = schema.getTable(meta.collection);

    if (!table) {
      return this.dump(this.createTable(meta));
    }

    return this.updateTable(meta, table).map(builder => this.dump(builder)).join('\n');
  }

  private getUpdateTableFKsSQL(meta: EntityMetadata, schema: DatabaseSchema): string {
    if (schema.getTable(meta.collection)) {
      return '';
    }

    return this.dump(this.knex.schema.alterTable(meta.collection, table => this.createForeignKeys(table, meta)));
  }

  private async wrapSchema(sql: string, wrap = true): Promise<string> {
    if (!wrap) {
      return sql;
    }

    let ret = this.helper.getSchemaBeginning();
    ret += sql;
    ret += this.helper.getSchemaEnd();

    return ret;
  }

  private createTable(meta: EntityMetadata): SchemaBuilder {
    return this.knex.schema.createTable(meta.collection, table => {
      Object
        .values(meta.properties)
        .filter(prop => this.shouldHaveColumn(meta, prop))
        .forEach(prop => {
          if (prop.reference === ReferenceType.SCALAR) {
            this.createTableColumn(table, meta, prop);
          } else {
            const meta2 = this.metadata.get(prop.type);
            meta2.primaryKeys.forEach((pk, idx) => {
              const columnName = prop.joinColumns ? prop.joinColumns[idx] : prop.fieldNames[idx];
              const col = table.specificType(columnName, meta2.properties[pk].columnTypes[0]);
              this.configureColumn(meta, prop, col, meta2.properties[pk]);
            });
          }
        });

      if (meta.compositePK) {
        table.primary(Utils.flatten(meta.primaryKeys.map(prop => meta.properties[prop].fieldNames)));
      }

      meta.indexes.forEach(index => {
        const properties = Utils.flatten(Utils.asArray(index.properties).map(prop => meta.properties[prop].fieldNames));
        table.index(properties, index.name, index.type);
      });

      meta.uniques.forEach(index => {
        const properties = Utils.flatten(Utils.asArray(index.properties).map(prop => meta.properties[prop].fieldNames));
        table.unique(properties, index.name);
      });

      this.helper.finalizeTable(table);
    });
  }

  private updateTable(meta: EntityMetadata, table: DatabaseTable): SchemaBuilder[] {
    const { create, update, remove } = this.computeTableDifference(meta, table);

    if (create.length + update.length + remove.length === 0) {
      return [];
    }

    const rename = this.findRenamedColumns(create, remove);
    const ret: SchemaBuilder[] = [];

    for (const prop of rename) {
      ret.push(this.knex.schema.raw(this.helper.getRenameColumnSQL(table.name, prop.from, prop.to)));
    }

    ret.push(this.knex.schema.alterTable(meta.collection, t => {
      for (const prop of create) {
        this.createTableColumn(t, meta, prop);
      }

      for (const col of update) {
        this.updateTableColumn(t, meta, col.prop, col.column, col.diff);
      }

      for (const column of remove) {
        this.dropTableColumn(t, column);
      }
    }));

    return ret;
  }

  private computeTableDifference(meta: EntityMetadata, table: DatabaseTable): { create: EntityProperty[]; update: { prop: EntityProperty; column: Column; diff: IsSame }[]; remove: Column[] } {
    const props = Object.values(meta.properties).filter(prop => this.shouldHaveColumn(meta, prop, true));
    const columns = table.getColumns();
    const create: EntityProperty[] = [];
    const update: { prop: EntityProperty; column: Column; diff: IsSame }[] = [];
    const remove = columns.filter(col => !props.find(prop => prop.fieldNames.includes(col.name) || (prop.joinColumns || []).includes(col.name)));

    for (const prop of props) {
      this.computeColumnDifference(table, prop, create, update);
    }

    return { create, update, remove };
  }

  private computeColumnDifference(table: DatabaseTable, prop: EntityProperty, create: EntityProperty[], update: { prop: EntityProperty; column: Column; diff: IsSame }[], joinColumn?: string, idx = 0): void {
    if ([ReferenceType.MANY_TO_ONE, ReferenceType.ONE_TO_ONE].includes(prop.reference) && !joinColumn) {
      return prop.joinColumns.forEach((joinColumn, idx) => this.computeColumnDifference(table, prop, create, update, joinColumn, idx));
    }

    if (!joinColumn) {
      return prop.fieldNames.forEach((fieldName, idx) => this.computeColumnDifference(table, prop, create, update, fieldName, idx));
    }

    const column = table.getColumn(joinColumn);

    if (!column) {
      create.push(prop);
      return;
    }

    if (this.helper.supportsColumnAlter() && !this.helper.isSame(prop, column, idx).all) {
      const diff = this.helper.isSame(prop, column, idx);
      update.push({ prop, column, diff });
    }
  }

  private dropTable(name: string): SchemaBuilder {
    let builder = this.knex.schema.dropTableIfExists(name);

    if (this.platform.usesCascadeStatement()) {
      builder = this.knex.schema.raw(builder.toQuery() + ' cascade');
    }

    return builder;
  }

  private shouldHaveColumn(meta: EntityMetadata, prop: EntityProperty, update = false): boolean {
    if (prop.persist === false) {
      return false;
    }

    if (meta.pivotTable) {
      return true;
    }

    if (prop.reference !== ReferenceType.SCALAR && !this.helper.supportsSchemaConstraints() && !update) {
      return false;
    }

    return [ReferenceType.SCALAR, ReferenceType.MANY_TO_ONE].includes(prop.reference) || (prop.reference === ReferenceType.ONE_TO_ONE && prop.owner);
  }

  private createTableColumn(table: TableBuilder, meta: EntityMetadata, prop: EntityProperty, pk?: string, idx = 0, alter?: IsSame): ColumnBuilder {
    if (prop.primary && !meta.compositePK && this.platform.isBigIntProperty(prop)) {
      return table.bigIncrements(prop.fieldNames[idx]);
    }

    if (prop.primary && !meta.compositePK && prop.type === 'number') {
      return table.increments(prop.fieldNames[idx]);
    }

    if (prop.enum && prop.items && prop.items.every(item => Utils.isString(item))) {
      const col = table.enum(prop.fieldNames[idx], prop.items!);
      return this.configureColumn(meta, prop, col, undefined, alter);
    }

    const columnName = pk && prop.joinColumns ? prop.joinColumns[idx] : prop.fieldNames[idx];
    const col = table.specificType(columnName, prop.columnTypes[idx]);
    return this.configureColumn(meta, prop, col, meta.properties[pk!], alter);
  }

  private updateTableColumn(table: TableBuilder, meta: EntityMetadata, prop: EntityProperty, column: Column, diff: IsSame): void {
    const equalDefinition = diff.sameTypes && diff.sameDefault && diff.sameNullable;

    if (column.fk && !diff.sameIndex) {
      table.dropForeign([column.fk.columnName], column.fk.constraintName);
    }

    if (column.indexes.length > 0 && !diff.sameIndex) {
      table.dropIndex(column.indexes.map(index => index.columnName));
    }

    if (column.fk && !diff.sameIndex && equalDefinition) {
      return this.createForeignKey(table, meta, prop, diff);
    }

    this.createTableColumn(table, meta, prop, undefined, undefined, diff).alter();
  }

  private dropTableColumn(table: TableBuilder, column: Column): void {
    if (column.fk) {
      table.dropForeign([column.fk.columnName], column.fk.constraintName);
    }

    column.indexes.forEach(i => table.dropIndex([i.columnName], i.keyName));
    table.dropColumn(column.name);
  }

  private configureColumn(meta: EntityMetadata, prop: EntityProperty, col: ColumnBuilder, pkProp?: EntityProperty, alter?: IsSame) {
    const nullable = (alter && this.platform.requiresNullableForAlteringColumn()) || prop.nullable!;
    const indexed = 'index' in prop ? prop.index : (prop.reference !== ReferenceType.SCALAR && this.helper.indexForeignKeys());
    const index = (indexed || (prop.primary && meta.compositePK)) && !(alter && alter.sameIndex);
    const indexName = Utils.isString(prop.index) ? prop.index : undefined;
    const uniqueName = Utils.isString(prop.unique) ? prop.unique : undefined;
    const hasDefault = typeof prop.default !== 'undefined'; // support falsy default values like `0`, `false` or empty string

    Utils.runIfNotEmpty(() => col.nullable(), nullable);
    Utils.runIfNotEmpty(() => col.notNullable(), !nullable);
    Utils.runIfNotEmpty(() => col.primary(), prop.primary && !meta.compositePK);
    Utils.runIfNotEmpty(() => col.unsigned(), (pkProp || prop).unsigned);
    Utils.runIfNotEmpty(() => col.index(indexName), index);
    Utils.runIfNotEmpty(() => col.unique(uniqueName), prop.unique);
    Utils.runIfNotEmpty(() => col.defaultTo(this.knex.raw('' + prop.default)), hasDefault);

    return col;
  }

  private createForeignKeys(table: TableBuilder, meta: EntityMetadata): void {
    Object.values(meta.properties)
      .filter(prop => prop.reference === ReferenceType.MANY_TO_ONE || (prop.reference === ReferenceType.ONE_TO_ONE && prop.owner))
      .forEach(prop => this.createForeignKey(table, meta, prop));
  }

  private createForeignKey(table: TableBuilder, meta: EntityMetadata, prop: EntityProperty, diff: IsSame = {}): void {
    if (this.helper.supportsSchemaConstraints()) {
      this.createForeignKeyReference(table, prop);

      return;
    }

    if (!meta.pivotTable) {
      this.createTableColumn(table, meta, prop, undefined, undefined, diff);
    }

    // knex does not allow adding new columns with FK in sqlite
    // @see https://github.com/knex/knex/issues/3351
    // const col = this.createTableColumn(table, meta, prop, true);
    // this.createForeignKeyReference(col, prop);
  }

  private createForeignKeyReference(table: TableBuilder, prop: EntityProperty): void {
    const meta2 = this.metadata.get(prop.type);
    const cascade = prop.cascade.includes(Cascade.REMOVE) || prop.cascade.includes(Cascade.ALL);

    meta2.primaryKeys.forEach((primaryKey, idx) => {
      const pk2 = meta2.properties[primaryKey];
      pk2.fieldNames.forEach(fieldName => {
        const col = table.foreign(prop.fieldNames[idx]).references(fieldName).inTable(meta2.collection);

        if (prop.onDelete || cascade || prop.nullable) {
          col.onDelete(prop.onDelete || (cascade ? 'cascade' : 'set null'));
        }

        if (prop.onUpdateIntegrity || prop.cascade.includes(Cascade.PERSIST) || prop.cascade.includes(Cascade.ALL)) {
          col.onUpdate(prop.onUpdateIntegrity || 'cascade');
        }
      });
    });
  }

  private findRenamedColumns(create: EntityProperty[], remove: Column[]): { from: Column; to: EntityProperty }[] {
    const renamed: { from: Column; to: EntityProperty }[] = [];

    for (const prop of create) {
      for (const fieldName of prop.fieldNames) {
        const match = remove.find(column => {
          const copy = Utils.copy(column);
          copy.name = fieldName;

          return this.helper.isSame(prop, copy).all;
        });

        if (match) {
          renamed.push({ from: match, to: prop });
        }
      }
    }

    renamed.forEach(prop => {
      create.splice(create.indexOf(prop.to), 1);
      remove.splice(remove.indexOf(prop.from), 1);
    });

    return renamed;
  }

  private dump(builder: SchemaBuilder, append = '\n\n'): string {
    const sql = builder.toQuery();
    return sql.length > 0 ? `${sql};${append}` : '';
  }

}
