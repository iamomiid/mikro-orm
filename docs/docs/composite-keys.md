---
title: Composite and Foreign Keys as Primary Key
sidebar_label: Composite Primary Keys
---

MikroORM supports composite primary keys natively. Composite keys are a very powerful 
relational database concept and we took good care to make sure MikroORM supports as many of the composite primary key use-cases. For MikroORM 2.0 composite keys of primitive data-types are supported, for MikroORM 2.1 even foreign keys as primary keys are supported.

This tutorial shows how the semantics of composite primary keys work and how they map to the database.

## General Considerations

Every entity with a composite key cannot use an id generator other than 'NONE'. That means the ID fields have to have their values set before you call em.persist(entity).

## Primitive Types only

Even in version 2.0 you can have composite keys as long as they only consist of the primitive types integer and string. Suppose you want to create a database of cars and use the model-name and year of production as primary keys:

```typescript
@Entity()
export class Car {

  @PrimaryKey()
  name: string;

  @PrimaryKey()
  year: number;

  constructor(name: string, year: number) {
    this.name = name;
    this.year = year;
  }

}
```

Now you can use this entity:

```typescript
const car = new Car('Audi A8', 2010);
await em.persistAndFlush(car);
```

And for querying you need to provide all primary keys in the condition:

```typescript
const audi = await em.findOneOrFail(Car, { name: 'Audi A8', year: 2010 });
```

You can also use this entity in associations. MikroORM will then generate two foreign 
keys one for name and to year to the related entities.

This example shows how you can nicely solve the requirement for existing values before em.persist(): By adding them as mandatory values for the constructor.

## Identity through foreign Entities

There are tons of use-cases where the identity of an Entity should be determined by 
the entity of one or many parent entities.

- Dynamic Attributes of an Entity (for example Article). Each Article has many attributes with primary key 'article_id' and 'attribute_name'.
- Address object of a Person, the primary key of the address is 'user_id'. This is not a case of a composite primary key, but the identity is derived through a foreign entity and a foreign key.
- Join Tables with metadata can be modelled as Entity, for example connections between two articles with a little description and a score.

The semantics of mapping identity through foreign entities are easy:

- Only allowed on Many-To-One or One-To-One associations.
- Plug an @Id annotation onto every association.
- Set an attribute association-key with the field name of the association in XML.

## Use-Case 1: Dynamic Attributes

We keep up the example of an Article with arbitrary attributes, the mapping looks like this:

```typescript
@Entity()
export class Article {

  @PrimaryKey()
  id!: number;

  @Property()
  title!: string;

  @OneToMany(() => ArticleAttribute, attr => attr.article, { cascade: Cascade.ALL })
  attributes = new Collection<ArticleAttribute>(this);

}

@Entity()
export class ArticleAttribute {

  @ManyToOne()
  article: Article;

  @PrimaryKey()
  attribute: string;

  @Property()
  value!: string;

  constructor(name: string, value: string, article: Article) {
    this.attribute = name;
    this.value = value;
    this.article = article;
  }

}
```

## Use-Case 2: Simple Derived Identity

Sometimes you have the requirement that two objects are related by a One-To-One association and that the dependent class should re-use the primary key of the class it depends on. One good example for this is a user-address relationship:

```typescript
@Entity()
export class User {

  @PrimaryKey()
  id!: number;

}

@Entity()
export class Address {

  @OneToOne()
  user!: User;

}
```

## Use-Case 3: Join-Table with Metadata

In the classic order product shop example there is the concept of the order item which contains references to order and product and additional data such as the amount of products purchased and maybe even the current price.

```typescript
@Entity()
export class Order {

  @PrimaryKey()
  id!: number;

  @ManyToOne()
  customer: Customer;

  @OneToMany(() => OrderItem, item => item.order)
  items = new Collection<OrderItem>(this);

  @Property()
  paid = false;

  @Property()
  shipped = false;

  @Property()
  created = new Date();

  constructor(customer: Customer) {
    this.customer = customer;
  }

}

@Entity()
export class Product {

  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @Property()
  currentPrice!: number;

}

@Entity()
export class OrderItem {

  @ManyToOne({ primary: true })
  order: Order;

  @ManyToOne({ primary: true })
  product: Product;

  @Property()
  amount = 1;

  @Property()
  offeredPrice: number;

  constructor(order: Order, product: Product, amount = 1) {
    this.order = order;
    this.product = product;
    this.offeredPrice = product.currentPrice;
  }

}
```

> This part of documentation is highly inspired by [doctrine tutorial](https://www.doctrine-project.org/projects/doctrine-orm/en/latest/tutorials/composite-primary-keys.html)
> as the behaviour here is pretty much the same.
