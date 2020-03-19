import { MikroORM } from '../lib';
import { Author2, Configuration2, FooBar2, FooBaz2, FooParam2, Test2, Address2, Car2, CarOwner2, User2 } from './entities-sql';
import { initORMMySql, wipeDatabaseMySql } from './bootstrap';
import { MySqlDriver } from '../lib/drivers/MySqlDriver';

describe('composite keys in mysql', () => {

  let orm: MikroORM<MySqlDriver>;

  beforeAll(async () => orm = await initORMMySql());
  beforeEach(async () => wipeDatabaseMySql(orm.em));

  test('dynamic attributes', async () => {
    const test = Test2.create('t');
    test.config.add(new Configuration2(test, 'foo', '1'));
    test.config.add(new Configuration2(test, 'bar', '2'));
    test.config.add(new Configuration2(test, 'baz', '3'));
    await orm.em.persistAndFlush(test);
    orm.em.clear();

    const t = await orm.em.findOneOrFail(Test2, test.id, ['config']);
    expect(t.getConfiguration()).toEqual({
      foo: '1',
      bar: '2',
      baz: '3',
    });
  });

  test('working with composite entity', async () => {
    const bar = FooBar2.create('bar');
    bar.id = 7;
    const baz = new FooBaz2('baz');
    baz.id = 3;
    const param = new FooParam2(bar, baz, 'val');
    await orm.em.persistAndFlush(param);
    orm.em.clear();

    const p1 = await orm.em.findOneOrFail(FooParam2, { bar: param.bar.id, baz: param.baz.id });
    expect(p1.bar.id).toBe(bar.id);
    expect(p1.baz.id).toBe(baz.id);
    expect(p1.value).toBe('val');

    p1.value = 'val2';
    await orm.em.flush();
    orm.em.clear();

    const p2 = await orm.em.findOneOrFail(FooParam2, { bar: param.bar.id, baz: param.baz.id });
    expect(p2.bar.id).toBe(bar.id);
    expect(p2.baz.id).toBe(baz.id);
    expect(p2.value).toBe('val2');
    expect(Object.keys(orm.em.getUnitOfWork().getIdentityMap()).sort()).toEqual(['FooBar2-7', 'FooBaz2-3', 'FooParam2-7~~~3']);

    const p3 = await orm.em.findOneOrFail(FooParam2, { bar: param.bar.id, baz: param.baz.id });
    expect(p3).toBe(p2);

    await orm.em.removeEntity(p3, true);
    const p4 = await orm.em.findOne(FooParam2, { bar: param.bar.id, baz: param.baz.id });
    expect(p4).toBeNull();
  });

  test('simple derived entity', async () => {
    const author = new Author2('n', 'e');
    author.id = 5;
    author.address = new Address2(author, 'v1');
    await orm.em.persistAndFlush(author);
    orm.em.clear();

    const a1 = await orm.em.findOneOrFail(Author2, author.id, ['address']);
    expect(a1.address!.value).toBe('v1');
    expect(a1.address!.author).toBe(a1);

    a1.address!.value = 'v2';
    await orm.em.flush();
    orm.em.clear();

    const a2 = await orm.em.findOneOrFail(Author2, author.id, ['address']);
    expect(a2.address!.value).toBe('v2');
    expect(a2.address!.author).toBe(a2);

    const address = await orm.em.findOneOrFail(Address2, author.id as any);
    expect(address.author).toBe(a2);
    expect(address.author.address).toBe(address);

    await orm.em.removeEntity(a2, true);
    const a3 = await orm.em.findOne(Author2, author.id);
    expect(a3).toBeNull();
    const address2 = await orm.em.findOne(Address2, author.id as any);
    expect(address2).toBeNull();
  });

  test('composite entity in m:1 relationship', async () => {
    const car = new Car2('Audi A8', 2010, 200_000);
    const owner = new CarOwner2('John Doe');
    owner.car = car;
    await orm.em.persistAndFlush(owner);
    orm.em.clear();

    const o1 = await orm.em.findOneOrFail(CarOwner2, owner.id, ['car']);
    expect(o1.car!.price).toBe(200_000);

    o1.car!.price = 150_000;
    await orm.em.flush();
    orm.em.clear();

    const o2 = await orm.em.findOneOrFail(CarOwner2, owner.id, ['car']);
    expect(o2.car!.price).toBe(150_000);

    const c1 = await orm.em.findOneOrFail(Car2, { name: car.name, year: car.year });
    expect(c1).toBe(o2.car);

    await orm.em.removeEntity(o2, true);
    const o3 = await orm.em.findOne(CarOwner2, owner.id);
    expect(o3).toBeNull();
    const c2 = await orm.em.findOneOrFail(Car2, car);
    expect(c2).toBe(o2.car);
    await orm.em.removeEntity(c2, true);
    const c3 = await orm.em.findOne(Car2, car);
    expect(c3).toBeNull();
  });

  test('composite entity in m:n relationship', async () => {
    const car1 = new Car2('Audi A8', 2011, 100_000);
    const car2 = new Car2('Audi A8', 2012, 150_000);
    const car3 = new Car2('Audi A8', 2013, 200_000);
    const user1 = new User2('John', 'Doe 1');
    const user2 = new User2('John', 'Doe 2');
    const user3 = new User2('John', 'Doe 3');
    user1.cars.add(car1, car3);
    user2.cars.add(car3);
    user2.cars.add(car2, car3);
    await orm.em.persistAndFlush([user1, user2, user3]);
    orm.em.clear();

    const u1 = await orm.em.findOneOrFail(User2, user1, ['cars']);
    expect(u1.cars.getItems()).toMatchObject([
      { name: 'Audi A8', price: 100_000, year: 2011 },
      { name: 'Audi A8', price: 200_000, year: 2013 },
    ]);

    u1.foo = 321;
    u1.cars[0].price = 350_000;
    await orm.em.flush();
    orm.em.clear();

    const u2 = await orm.em.findOneOrFail(User2, u1, ['cars']);
    expect(u2.cars[0].price).toBe(350_000);

    const c1 = await orm.em.findOneOrFail(Car2, { name: car1.name, year: car1.year });
    expect(c1).toBe(u2.cars[0]);

    await orm.em.removeEntity(u2, true);
    const o3 = await orm.em.findOne(User2, u1);
    expect(o3).toBeNull();
    const c2 = await orm.em.findOneOrFail(Car2, car1);
    expect(c2).toBe(u2.cars[0]);
    await orm.em.removeEntity(c2, true);
    const c3 = await orm.em.findOne(Car2, car1);
    expect(c3).toBeNull();
  });

  afterAll(async () => orm.close(true));

});
