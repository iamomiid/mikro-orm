import { BASE_DIR, initORMMySql, initORMPostgreSql, initORMSqlite, initORMSqlite2 } from './bootstrap';
import { SchemaGenerator } from '../lib/schema';
import { ReferenceType } from '../lib/entity';
import { Configuration, Utils } from '../lib/utils';
import { MikroORM } from '../lib';
import { MongoDriver } from '../lib/drivers/MongoDriver';
import { FooBar2, FooBaz2 } from './entities-sql';
import { BaseEntity22 } from './entities-sql/BaseEntity22';

describe('SchemaGenerator', () => {

  test('create/drop database [mysql]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      port: 3307,
      baseDir: BASE_DIR,
      type: 'mysql',
    });

    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
    await generator.dropDatabase(dbName);
    await orm.close(true);
  });

  test('create schema also creates the database if not exists [mysql]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      port: 3307,
      baseDir: BASE_DIR,
      type: 'mysql',
      migrations: { path: BASE_DIR + '/../temp/migrations' },
    });

    const generator = orm.getSchemaGenerator();
    await generator.createSchema();
    await generator.dropSchema(false, false, true);
    await orm.close(true);

    await orm.isConnected();
  });

  test('create/drop database [mariadb]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      port: 3307,
      baseDir: BASE_DIR,
      type: 'mariadb',
    });

    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
    await generator.dropDatabase(dbName);
    await orm.close(true);
    await expect(generator.ensureDatabase()).rejects.toThrow('Unable to acquire a connection');
  });

  test('create schema also creates the database if not exists [mariadb]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      port: 3307,
      baseDir: BASE_DIR,
      type: 'mariadb',
      migrations: { path: BASE_DIR + '/../temp/migrations' },
    });

    const generator = orm.getSchemaGenerator();
    await generator.createSchema();
    await generator.dropSchema(false, false, true);
    await orm.close(true);
    await expect(generator.ensureDatabase()).rejects.toThrow('Unable to acquire a connection');
  });

  test('generate schema from metadata [mysql]', async () => {
    const orm = await initORMMySql();
    orm.em.getConnection().execute('drop table if exists new_table');
    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
    const dump = await generator.generate();
    expect(dump).toMatchSnapshot('mysql-schema-dump');

    const dropDump = await generator.getDropSchemaSQL();
    expect(dropDump).toMatchSnapshot('mysql-drop-schema-dump');

    const createDump = await generator.getCreateSchemaSQL();
    expect(createDump).toMatchSnapshot('mysql-create-schema-dump');

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('mysql-update-schema-dump');

    await orm.close(true);
  });

  test('update schema [mysql]', async () => {
    const orm = await initORMMySql();
    orm.em.getConnection().execute('drop table if exists new_table');
    const meta = orm.getMetadata();
    const generator = orm.getSchemaGenerator();

    const newTableMeta = {
      properties: {
        id: {
          reference: ReferenceType.SCALAR,
          primary: true,
          name: 'id',
          type: 'number',
          fieldNames: ['id'],
          columnTypes: ['int(11)'],
        },
        createdAt: {
          reference: ReferenceType.SCALAR,
          length: 3,
          default: 'current_timestamp(3)',
          name: 'createdAt',
          type: 'Date',
          fieldNames: ['created_at'],
          columnTypes: ['datetime(3)'],
        },
        updatedAt: {
          reference: ReferenceType.SCALAR,
          length: 3,
          default: 'current_timestamp(3)',
          name: 'updatedAt',
          type: 'Date',
          fieldNames: ['updated_at'],
          columnTypes: ['datetime(3)'],
        },
        name: {
          reference: ReferenceType.SCALAR,
          name: 'name',
          type: 'string',
          fieldNames: ['name'],
          columnTypes: ['varchar(255)'],
        },
      },
      name: 'NewTable',
      hooks: {},
      indexes: [],
      uniques: [],
      collection: 'new_table',
      primaryKey: 'id',
    } as any;
    meta.set('NewTable', newTableMeta);
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-create-table');
    await generator.updateSchema();

    const authorMeta = meta.get('Author2');
    const favouriteBookProp = Utils.copy(authorMeta.properties.favouriteBook);
    authorMeta.properties.born.type = 'number';
    authorMeta.properties.born.columnTypes = ['int'];
    authorMeta.properties.born.nullable = false;
    authorMeta.properties.born.default = 42;
    authorMeta.properties.age.default = 42;
    authorMeta.properties.favouriteAuthor.type = 'FooBar2';
    authorMeta.properties.favouriteAuthor.referencedTableName = 'foo_bar2';
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-alter-column');
    await generator.updateSchema();

    const idProp = newTableMeta.properties.id;
    const updatedAtProp = newTableMeta.properties.updatedAt;
    delete newTableMeta.properties.id;
    delete newTableMeta.properties.updatedAt;
    delete authorMeta.properties.favouriteBook;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-drop-column');
    await generator.updateSchema();

    const ageProp = authorMeta.properties.age;
    ageProp.name = 'ageInYears';
    ageProp.fieldNames = ['age_in_years'];
    const favouriteAuthorProp = authorMeta.properties.favouriteAuthor;
    favouriteAuthorProp.name = 'favouriteWriter';
    favouriteAuthorProp.fieldNames = ['favourite_writer_id'];
    favouriteAuthorProp.joinColumns = ['favourite_writer_id'];
    delete authorMeta.properties.favouriteAuthor;
    authorMeta.properties.favouriteWriter = favouriteAuthorProp;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-rename-column');
    await generator.updateSchema();

    newTableMeta.properties.id = idProp;
    newTableMeta.properties.updatedAt = updatedAtProp;
    authorMeta.properties.favouriteBook = favouriteBookProp;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-add-column');
    await generator.updateSchema();

    meta.reset('Author2');
    meta.reset('NewTable');
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('mysql-update-schema-drop-table');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('generate schema from metadata [sqlite]', async () => {
    const orm = await initORMSqlite();
    const generator = orm.getSchemaGenerator();
    const dump = await generator.generate();
    expect(dump).toMatchSnapshot('sqlite-schema-dump');

    const dropDump = await generator.getDropSchemaSQL(false, true);
    expect(dropDump).toMatchSnapshot('sqlite-drop-schema-dump-1');
    await generator.dropSchema(true, true);

    const dropDump2 = await generator.getDropSchemaSQL();
    expect(dropDump2).toMatchSnapshot('sqlite-drop-schema-dump-2');
    await generator.dropSchema();

    const createDump = await generator.getCreateSchemaSQL();
    expect(createDump).toMatchSnapshot('sqlite-create-schema-dump');
    await generator.createSchema();

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('sqlite-update-schema-dump');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('generate schema from metadata [sqlite2]', async () => {
    const orm = await initORMSqlite2();
    const generator = orm.getSchemaGenerator();
    const dump = await generator.generate();
    expect(dump).toMatchSnapshot('sqlite2-schema-dump');

    const dropDump = await generator.getDropSchemaSQL(false, true);
    expect(dropDump).toMatchSnapshot('sqlite2-drop-schema-dump-1');
    await generator.dropSchema(true, true);

    const dropDump2 = await generator.getDropSchemaSQL();
    expect(dropDump2).toMatchSnapshot('sqlite2-drop-schema-dump-2');
    await generator.dropSchema();

    const createDump = await generator.getCreateSchemaSQL();
    expect(createDump).toMatchSnapshot('sqlite2-create-schema-dump');
    await generator.createSchema();

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('sqlite2-update-schema-dump');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('create/drop database [postgresql]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      baseDir: BASE_DIR,
      type: 'postgresql',
    });

    const generator = orm.getSchemaGenerator();
    await generator.ensureDatabase();
    await generator.dropDatabase(dbName);
    await orm.close(true);
  });

  test('create schema also creates the database if not exists [postgresql]', async () => {
    const dbName = `mikro_orm_test_${Date.now()}`;
    const orm = await MikroORM.init({
      entities: [FooBar2, FooBaz2, BaseEntity22],
      discovery: { tsConfigPath: BASE_DIR + '/tsconfig.test.json' },
      dbName,
      baseDir: BASE_DIR,
      type: 'postgresql',
      migrations: { path: BASE_DIR + '/../temp/migrations' },
    });

    const generator = orm.getSchemaGenerator();
    await generator.createSchema();
    await generator.dropSchema(false, false, true);
    await orm.close(true);

    await orm.isConnected();
  });

  test('generate schema from metadata [postgres]', async () => {
    const orm = await initORMPostgreSql();
    orm.em.getConnection().execute('drop table if exists new_table cascade');
    const generator = orm.getSchemaGenerator();
    const dump = await generator.generate();
    expect(dump).toMatchSnapshot('postgres-schema-dump');

    const dropDump = await generator.getDropSchemaSQL();
    expect(dropDump).toMatchSnapshot('postgres-drop-schema-dump');

    const createDump = await generator.getCreateSchemaSQL();
    expect(createDump).toMatchSnapshot('postgres-create-schema-dump');

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('postgres-update-schema-dump');

    await orm.close(true);
  });

  test('update schema [postgres]', async () => {
    const orm = await initORMPostgreSql();
    orm.em.getConnection().execute('drop table if exists new_table cascade');
    const meta = orm.getMetadata();
    const generator = orm.getSchemaGenerator();

    const newTableMeta = {
      properties: {
        id: {
          reference: ReferenceType.SCALAR,
          primary: true,
          name: 'id',
          type: 'number',
          fieldNames: ['id'],
          columnTypes: ['int4'],
        },
        createdAt: {
          reference: ReferenceType.SCALAR,
          length: 3,
          default: 'current_timestamp(3)',
          name: 'createdAt',
          type: 'Date',
          fieldNames: ['created_at'],
          columnTypes: ['timestamp(3)'],
        },
        updatedAt: {
          reference: ReferenceType.SCALAR,
          length: 3,
          default: 'current_timestamp(3)',
          name: 'updatedAt',
          type: 'Date',
          fieldNames: ['updated_at'],
          columnTypes: ['timestamp(3)'],
        },
        name: {
          reference: ReferenceType.SCALAR,
          name: 'name',
          type: 'string',
          fieldNames: ['name'],
          columnTypes: ['varchar(255)'],
        },
      },
      name: 'NewTable',
      collection: 'new_table',
      primaryKey: 'id',
      hooks: {},
      indexes: [],
      uniques: [],
    } as any;
    meta.set('NewTable', newTableMeta);
    const authorMeta = meta.get('Author2');
    authorMeta.properties.termsAccepted.default = false;

    await generator.getUpdateSchemaSQL(false);
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-create-table');
    await generator.updateSchema();

    const favouriteBookProp = Utils.copy(authorMeta.properties.favouriteBook);
    authorMeta.properties.name.type = 'number';
    authorMeta.properties.name.columnTypes = ['int4'];
    authorMeta.properties.name.nullable = false;
    authorMeta.properties.name.default = 42;
    authorMeta.properties.age.default = 42;
    authorMeta.properties.favouriteAuthor.type = 'FooBar2';
    authorMeta.properties.favouriteAuthor.referencedTableName = 'foo_bar2';
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-alter-column');
    await generator.updateSchema();

    const idProp = newTableMeta.properties.id;
    const updatedAtProp = newTableMeta.properties.updatedAt;
    delete newTableMeta.properties.id;
    delete newTableMeta.properties.updatedAt;
    delete authorMeta.properties.favouriteBook;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-drop-column');
    await generator.updateSchema();

    const ageProp = authorMeta.properties.age;
    ageProp.name = 'ageInYears';
    ageProp.fieldNames = ['age_in_years'];
    const favouriteAuthorProp = authorMeta.properties.favouriteAuthor;
    favouriteAuthorProp.name = 'favouriteWriter';
    favouriteAuthorProp.fieldNames = ['favourite_writer_id'];
    favouriteAuthorProp.joinColumns = ['favourite_writer_id'];
    delete authorMeta.properties.favouriteAuthor;
    authorMeta.properties.favouriteWriter = favouriteAuthorProp;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-rename-column');
    await generator.updateSchema();

    newTableMeta.properties.id = idProp;
    newTableMeta.properties.updatedAt = updatedAtProp;
    authorMeta.properties.favouriteBook = favouriteBookProp;
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-add-column');
    await generator.updateSchema();

    meta.reset('Author2');
    meta.reset('NewTable');
    await expect(generator.getUpdateSchemaSQL(false)).resolves.toMatchSnapshot('postgres-update-schema-drop-table');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('update empty schema from metadata [mysql]', async () => {
    const orm = await initORMMySql();
    orm.em.getConnection().execute('drop table if exists new_table');
    const generator = orm.getSchemaGenerator();
    await generator.dropSchema();

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('mysql-update-empty-schema-dump');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('update empty schema from metadata [postgres]', async () => {
    const orm = await initORMPostgreSql();
    const generator = orm.getSchemaGenerator();
    await generator.dropSchema();

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('postgres-update-empty-schema-dump');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('update empty schema from metadata [sqlite]', async () => {
    const orm = await initORMSqlite();
    const generator = orm.getSchemaGenerator();
    await generator.dropSchema();

    const updateDump = await generator.getUpdateSchemaSQL();
    expect(updateDump).toMatchSnapshot('sqlite-update-empty-schema-dump');
    await generator.updateSchema();

    await orm.close(true);
  });

  test('not supported [mongodb]', async () => {
    const mongoOrm = Object.create(MikroORM.prototype, { driver: new MongoDriver(new Configuration({} as any, false)) } as any);
    expect(() => mongoOrm.getSchemaGenerator()).toThrowError('Not supported by given driver');
  });

});
