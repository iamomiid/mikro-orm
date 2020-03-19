import { CodeBlockWriter, IndentationText, Project, QuoteKind, SourceFile } from 'ts-morph';
import { ensureDir, writeFile } from 'fs-extra';

import { AbstractSqlDriver, Configuration, DatabaseSchema, Dictionary, Utils } from '..';
import { Platform } from '../platforms';
import { EntityProperty } from '../typings';
import { Column, DatabaseTable } from './DatabaseTable';

export class EntityGenerator {

  private readonly platform: Platform = this.driver.getPlatform();
  private readonly helper = this.platform.getSchemaHelper()!;
  private readonly connection = this.driver.getConnection();
  private readonly namingStrategy = this.config.getNamingStrategy();
  private readonly project = new Project();
  private readonly sources: SourceFile[] = [];

  constructor(private readonly driver: AbstractSqlDriver,
              private readonly config: Configuration) {
    this.project.manipulationSettings.set({ quoteKind: QuoteKind.Single, indentationText: IndentationText.TwoSpaces });
  }

  async generate(options: { baseDir?: string; save?: boolean } = {}): Promise<string[]> {
    const baseDir = Utils.normalizePath(options.baseDir || this.config.get('baseDir') + '/generated-entities');
    const schema = await DatabaseSchema.create(this.connection, this.helper, this.config);

    for (const table of schema.getTables()) {
      await this.createEntity(table);
    }

    this.sources.forEach(entity => {
      entity.fixMissingImports();
      entity.fixUnusedIdentifiers();
      entity.organizeImports();
    });

    if (options.save) {
      await ensureDir(baseDir);
      await Promise.all(this.sources.map(e => writeFile(baseDir + '/' + e.getBaseName(), e.getFullText())));
    }

    return this.sources.map(e => e.getFullText());
  }

  async createEntity(table: DatabaseTable): Promise<void> {
    const properties: [string, string][] = [];
    const entity = this.project.createSourceFile(this.namingStrategy.getClassName(table.name, '_') + '.ts', writer => {
      writer.writeLine(`import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, OneToOne, ManyToMany, Cascade } from 'mikro-orm';`);
      writer.blankLine();
      writer.writeLine('@Entity()');
      writer.write(`export class ${this.namingStrategy.getClassName(table.name, '_')}`);
      writer.block(() => table.getColumns().forEach(column => this.createProperty(writer, column, properties)));
      writer.write('');
    });

    this.sources.push(entity);
  }

  createProperty(writer: CodeBlockWriter, column: Column, properties: [string, string][]): void {
    const prop = this.getPropertyName(column);
    const type = this.getPropertyType(column);
    const columnType = this.getPropertyType(column, '__false') === '__false' ? column.type : undefined;
    const defaultValue = this.getPropertyDefaultValue(column, type);
    const decorator = this.getPropertyDecorator(prop, column, type, defaultValue, columnType);
    const definition = this.getPropertyDefinition(column, prop, type, defaultValue);

    // in case of composite keys in references, we get duplicates, so ignore them here
    if (properties.find(prop => prop[0] === decorator && prop[1] === definition )) {
      return;
    }

    properties.push([decorator, definition]);
    writer.blankLineIfLastNot();
    writer.writeLine(decorator);
    writer.writeLine(definition);
    writer.blankLine();
  }

  private getPropertyDefinition(column: Column, prop: string, type: string, defaultValue: any): string {
    // string defaults are usually things like SQL functions
    const useDefault = defaultValue && typeof defaultValue !== 'string';
    const optional = column.nullable ? '?' : (useDefault ? '' : '!');
    const ret = `${prop}${optional}: ${type}`;

    if (!useDefault) {
      return ret + ';';
    }

    return `${ret} = ${defaultValue};`;
  }

  private getPropertyDecorator(prop: string, column: Column, type: string, defaultValue: any, columnType?: string): string {
    const options = {} as any;
    const decorator = this.getDecoratorType(column);

    if (column.fk) {
      this.getForeignKeyDecoratorOptions(options, column, prop);
    } else {
      this.getScalarPropertyDecoratorOptions(type, column, options, prop, columnType);
    }

    this.getCommonDecoratorOptions(column, options, defaultValue, columnType);

    if (Object.keys(options).length === 0) {
      return decorator + '()';
    }

    return `${decorator}({ ${Object.entries(options).map(([opt, val]) => `${opt}: ${val}`).join(', ')} })`;
  }

  private getCommonDecoratorOptions(column: Column, options: Dictionary, defaultValue: any, columnType?: string) {
    if (columnType) {
      options.columnType = `'${columnType}'`;
    }

    if (column.nullable) {
      options.nullable = true;
    }

    if (defaultValue && typeof defaultValue === 'string') {
      options.default = `\`${defaultValue}\``;
    }
  }

  private getScalarPropertyDecoratorOptions(type: string, column: Column, options: Dictionary, prop: string, columnType?: string): void {
    const defaultColumnType = this.helper.getTypeDefinition({
      type,
      length: column.maxLength,
    } as EntityProperty).replace(/\(\d+\)/, '');

    if (column.type !== defaultColumnType && column.type !== columnType) {
      options.type = `'${column.type}'`;
    }

    if (column.name !== this.namingStrategy.propertyToColumnName(prop)) {
      options.fieldName = `'${column.name}'`;
    }

    if (column.maxLength && column.type !== 'enum') {
      options.length = column.maxLength;
    }
  }

  private getForeignKeyDecoratorOptions(options: Dictionary, column: Column, prop: string) {
    options.entity = `() => ${this.namingStrategy.getClassName(column.fk.referencedTableName, '_')}`;

    if (column.name !== this.namingStrategy.joinKeyColumnName(prop, column.fk.referencedColumnName)) {
      options.fieldName = `'${column.name}'`;
    }

    const cascade = ['Cascade.MERGE'];
    const onUpdate = column.fk.updateRule.toLowerCase();
    const onDelete = column.fk.deleteRule.toLowerCase();

    if (onUpdate === 'cascade') {
      cascade.push('Cascade.PERSIST');
    }

    if (onDelete === 'cascade') {
      cascade.push('Cascade.REMOVE');
    }

    if (cascade.length === 3) {
      cascade.length = 0;
      cascade.push('Cascade.ALL');
    }

    if (!(cascade.length === 2 && cascade.includes('Cascade.PERSIST') && cascade.includes('Cascade.MERGE'))) {
      options.cascade = `[${cascade.sort().join(', ')}]`;
    }

    if (column.primary) {
      options.primary = true;
    }
  }

  private getDecoratorType(column: Column): string {
    if (column.fk && column.unique) {
      return '@OneToOne';
    }

    if (column.fk) {
      return '@ManyToOne';
    }

    if (column.primary) {
      return '@PrimaryKey';
    }

    return '@Property';
  }

  private getPropertyName(column: Column): string {
    let field = column.name;

    if (column.fk) {
      field = field.replace(new RegExp(`_${column.fk.referencedColumnName}$`), '');
    }

    return field.replace(/_(\w)/g, m => m[1].toUpperCase()).replace(/_+/g, '');
  }

  private getPropertyType(column: Column, defaultType = 'string'): string {
    if (column.fk) {
      return this.namingStrategy.getClassName(column.fk.referencedTableName, '_');
    }

    return this.helper.getTypeFromDefinition(column.type, defaultType);
  }

  private getPropertyDefaultValue(column: Column, propType: string): any {
    if (!column.defaultValue) {
      return;
    }

    const val = this.helper.normalizeDefaultValue(column.defaultValue, column.maxLength);

    if (column.nullable && val === 'null') {
      return;
    }

    if (propType === 'boolean') {
      return !!column.defaultValue;
    }

    if (propType === 'number') {
      return +column.defaultValue;
    }

    return '' + val;
  }

}
