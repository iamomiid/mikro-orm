import { SchemaHelper } from '../lib/schema';
import { SqliteSchemaHelper } from '../lib/schema/SqliteSchemaHelper';
import { MySqlSchemaHelper } from '../lib/schema/MySqlSchemaHelper';
import { PostgreSqlSchemaHelper } from '../lib/schema/PostgreSqlSchemaHelper';

class SchemaHelperTest extends SchemaHelper { }

describe('SchemaHelper', () => {

  test('default schema helpers', async () => {
    const helper = new SchemaHelperTest();
    expect(helper.getSchemaBeginning()).toBe('');
    expect(helper.getSchemaEnd()).toBe('');
    expect(helper.getTypeDefinition({ type: 'test' } as any)).toBe('test');
    expect(helper.isSame({ reference: 'scalar', type: 'number', nullable: false, columnTypes: ['integer'], default: 42 } as any, { type: 'integer', nullable: false, defaultValue: '42' } as any).all).toBe(true);
    expect(helper.isSame({ reference: 'scalar', type: 'number', nullable: false, columnTypes: ['integer'], default: 42 } as any, { type: 'int4', nullable: false, defaultValue: '42' } as any).all).toBe(false);
    expect(helper.isSame({ reference: 'scalar', type: 'number', nullable: false, columnTypes: ['integer'], default: undefined } as any, { type: 'integer', nullable: false, defaultValue: '42' } as any).all).toBe(false);
    expect(() => helper.getListTablesSQL()).toThrowError('Not supported by given driver');
    expect(() => helper.getForeignKeysSQL('table')).toThrowError('Not supported by given driver');
    await expect(helper.getColumns({} as any, 'table')).rejects.toThrowError('Not supported by given driver');
    await expect(helper.getIndexes({} as any, 'table')).rejects.toThrowError('Not supported by given driver');
  });

  test('mysql schema helper', async () => {
    const helper = new MySqlSchemaHelper();
    const from = { name: 'test1' };
    const to = { fieldNames: ['test_123'], nullable: false, columnTypes: ['int'] };
    expect(helper.getRenameColumnSQL('table', from as any, to as any)).toBe('alter table `table` change `test1` `test_123` int not null');
  });

  test('sqlite schema helper', async () => {
    const helper = new SqliteSchemaHelper();
    expect(helper.isSame({ reference: 'scalar', type: 'number', nullable: false, columnTypes: ['integer'], default: 42 } as any, { type: 'integer', nullable: false, defaultValue: '42' } as any).all).toBe(true);
    expect(helper.getRenameColumnSQL('table', { name: 'test1' } as any, { fieldNames: ['test_123'] } as any)).toBe('alter table `table` rename column `test1` to `test_123`');
  });

  test('postgres schema helper', async () => {
    const helper = new PostgreSqlSchemaHelper();
    expect(helper.isSame({ reference: 'scalar', type: 'Date', nullable: false, columnTypes: ['timestamp(3)'], default: 'current_timestamp(3)' } as any, { type: 'timestamp(3)', nullable: false, defaultValue: `('now'::text)::timestamp(3) with time zone` } as any).all).toBe(true);
  });

});
