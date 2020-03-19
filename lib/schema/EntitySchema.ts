import { AnyEntity, Constructor, EntityMetadata, EntityName, EntityProperty } from '../typings';
import {
  EnumOptions,
  IndexOptions,
  ManyToManyOptions,
  ManyToOneOptions,
  OneToManyOptions,
  OneToOneOptions,
  PrimaryKeyOptions,
  PropertyOptions,
  SerializedPrimaryKeyOptions,
  UniqueOptions,
} from '../decorators';
import { Cascade, Collection, EntityRepository, ReferenceType } from '../entity';
import { Type } from '../types';
import { Utils } from '../utils';

type CollectionItem<T> = T extends Collection<infer K> ? K : T;
type TypeType = string | NumberConstructor | StringConstructor | BooleanConstructor | DateConstructor | ArrayConstructor | Constructor<Type>;
type TypeDef<T> = { type: TypeType } | { customType: Type } | { entity: string | (() => string | EntityName<T>) };
type Property<T> =
  | ({ reference: ReferenceType.MANY_TO_ONE | 'm:1' } & TypeDef<T> & ManyToOneOptions<T>)
  | ({ reference: ReferenceType.ONE_TO_ONE | '1:1' } & TypeDef<T> & OneToOneOptions<T>)
  | ({ reference: ReferenceType.ONE_TO_MANY | '1:m' } & TypeDef<T> & OneToManyOptions<T>)
  | ({ reference: ReferenceType.MANY_TO_MANY | 'm:n' } & TypeDef<T> & ManyToManyOptions<T>)
  | ({ enum: true } & EnumOptions)
  | (TypeDef<T> & PropertyOptions);
type Metadata<T, U> =
  & Omit<Partial<EntityMetadata<T>>, 'name' | 'properties'>
  & ({ name: string } | { class: Constructor<T>; name?: string })
  & { properties?: { [K in keyof Omit<T, keyof U> & string]-?: Property<CollectionItem<NonNullable<T[K]>>> } };

export class EntitySchema<T extends AnyEntity<T> = AnyEntity, U extends AnyEntity<T> | undefined = undefined> {

  private readonly _meta: EntityMetadata<T> = {} as EntityMetadata<T>;
  private readonly internal: boolean;
  private initialized = false;

  constructor(meta: Metadata<T, U> | EntityMetadata<T>, internal = false) {
    meta.name = meta.class ? meta.class.name : meta.name;
    Utils.renameKey(meta, 'tableName', 'collection');
    meta.tableName = meta.collection;
    Object.assign(this._meta, { className: meta.name, properties: {}, hooks: {}, indexes: [], uniques: [] }, meta);
    this.internal = internal;
  }

  addProperty(name: string & keyof T, type?: TypeType, options: PropertyOptions | EntityProperty = {}): void {
    const prop = { name, reference: ReferenceType.SCALAR, ...options, type: this.normalizeType(options, type) } as EntityProperty<T>;

    if (type && Object.getPrototypeOf(type) === Type) {
      prop.type = type as string;
    }

    this._meta.properties[name] = prop;
  }

  addEnum(name: string & keyof T, type?: TypeType, options: EnumOptions = {}): void {
    if (options.items instanceof Function) {
      options.items = Utils.extractEnumValues(options.items());
    }

    const prop = { enum: true, ...options };
    this.addProperty(name, this.internal ? type : type || 'enum', prop);
  }

  addVersion(name: string & keyof T, type: TypeType, options: PropertyOptions = {}): void {
    this.addProperty(name, type, { version: true, ...options });
  }

  addPrimaryKey(name: string & keyof T, type: TypeType, options: PrimaryKeyOptions = {}): void {
    this.addProperty(name, type, { primary: true, ...options });
  }

  addSerializedPrimaryKey(name: string & keyof T, type: TypeType, options: SerializedPrimaryKeyOptions = {}): void {
    this._meta.serializedPrimaryKey = name;
    this.addProperty(name, type, options);
  }

  addManyToOne<K = object>(name: string & keyof T, type: TypeType, options: ManyToOneOptions<K>): void {
    const prop = { reference: ReferenceType.MANY_TO_ONE, cascade: [Cascade.PERSIST, Cascade.MERGE], ...options };
    Utils.defaultValue(prop, 'nullable', prop.cascade.includes(Cascade.REMOVE) || prop.cascade.includes(Cascade.ALL));
    this.addProperty(name, type, prop);
  }

  addManyToMany<K = object>(name: string & keyof T, type: TypeType, options: ManyToManyOptions<K>): void {
    options.fixedOrder = options.fixedOrder || !!options.fixedOrderColumn;

    if (!options.owner && !options.mappedBy) {
      options.owner = true;
    }

    if (options.owner) {
      Utils.renameKey(options, 'mappedBy', 'inversedBy');
    }

    const prop = { reference: ReferenceType.MANY_TO_MANY, cascade: [Cascade.PERSIST, Cascade.MERGE], ...options };
    this.addProperty(name, type, prop);
  }

  addOneToMany<K = object>(name: string & keyof T, type: TypeType, options: OneToManyOptions<K>): void {
    const prop = { reference: ReferenceType.ONE_TO_MANY, cascade: [Cascade.PERSIST, Cascade.MERGE], ...options };
    this.addProperty(name, type, prop);
  }

  addOneToOne<K = object>(name: string & keyof T, type: TypeType, options: OneToOneOptions<K>): void {
    const prop = { reference: ReferenceType.ONE_TO_ONE, cascade: [Cascade.PERSIST, Cascade.MERGE], ...options };
    Utils.defaultValue(prop, 'nullable', prop.cascade.includes(Cascade.REMOVE) || prop.cascade.includes(Cascade.ALL));
    prop.owner = prop.owner || !!prop.inversedBy || !prop.mappedBy;
    prop.unique = prop.owner;

    if (prop.owner && options.mappedBy) {
      Utils.renameKey(prop, 'mappedBy', 'inversedBy');
    }

    this.addProperty(name, type, prop);
  }

  addIndex(options: Required<Omit<IndexOptions, 'name' | 'type'>> & { name?: string; type?: string }): void {
    this._meta.indexes.push(options as Required<IndexOptions>);
  }

  addUnique(options: Required<Omit<UniqueOptions, 'name'>> & { name?: string }): void {
    this._meta.uniques.push(options as Required<UniqueOptions>);
  }

  setCustomRepository(repository: () => Constructor<EntityRepository<T>>): void {
    this._meta.customRepository = repository;
  }

  setExtends(base: string): void {
    this._meta.extends = base;
  }

  setClass(proto: Constructor<T>) {
    this._meta.class = proto;
    this._meta.prototype = proto.prototype;
    this._meta.className = proto.name;
    this._meta.constructorParams = Utils.getParamNames(proto, 'constructor');
    this._meta.toJsonParams = Utils.getParamNames(proto, 'toJSON').filter(p => p !== '...args');
    this._meta.extends = this._meta.extends || Object.getPrototypeOf(proto).name || undefined;
  }

  get meta() {
    return this._meta;
  }

  get name() {
    return this._meta.name;
  }

  /**
   * @internal
   */
  init() {
    if (this.initialized) {
      return this;
    }

    if (!this._meta.class) {
      this._meta.class = ({ [this.name]: class {} })[this.name] as Constructor<T>;
    }

    this.setClass(this._meta.class);

    if (this._meta.abstract) {
      delete this._meta.name;
    }

    this.initProperties();
    this.initPrimaryKeys();
    this.initialized = true;

    return this;
  }

  private initProperties(): void {
    Object.entries<Property<T[keyof T]>>(this._meta.properties).forEach(([name, options]) => {
      options.type = 'customType' in options ? options.customType.constructor.name : options.type;

      switch ((options as EntityProperty).reference) {
        case ReferenceType.ONE_TO_ONE:
          this.addOneToOne(name as keyof T & string, options.type, options);
          break;
        case ReferenceType.ONE_TO_MANY:
          this.addOneToMany(name as keyof T & string, options.type, options);
          break;
        case ReferenceType.MANY_TO_ONE:
          this.addManyToOne(name as keyof T & string, options.type, options);
          break;
        case ReferenceType.MANY_TO_MANY:
          this.addManyToMany(name as keyof T & string, options.type, options);
          break;
        default:
          if ((options as EntityProperty).enum) {
            this.addEnum(name as keyof T & string, options.type, options);
          } else if (options.primary) {
            this.addPrimaryKey(name as keyof T & string, options.type, options);
          } else if (options.serializedPrimaryKey) {
            this.addSerializedPrimaryKey(name as keyof T & string, options.type, options);
          } else if (options.version) {
            this.addVersion(name as keyof T & string, options.type, options);
          } else {
            this.addProperty(name as keyof T & string, options.type, options);
          }
      }
    });
  }

  private initPrimaryKeys(): void {
    const pks = Object.values<EntityProperty<T>>(this._meta.properties).filter(prop => prop.primary);

    if (pks.length > 0) {
      // noinspection JSDeprecatedSymbols
      this._meta.primaryKey = pks[0].name;
      this._meta.primaryKeys = pks.map(prop => prop.name);
      this._meta.compositePK = pks.length > 1;
    }

    // FK used as PK, we need to cascade
    if (pks.length === 1 && pks[0].reference !== ReferenceType.SCALAR) {
      pks[0].cascade.push(Cascade.REMOVE);
    }

    const serializedPrimaryKey = Object.values<EntityProperty<T>>(this._meta.properties).find(prop => prop.serializedPrimaryKey);

    if (serializedPrimaryKey) {
      this._meta.serializedPrimaryKey = serializedPrimaryKey.name;
    }
  }

  private normalizeType(options: PropertyOptions | EntityProperty, type: string | any | Constructor<Type>) {
    if ('entity' in options) {
      if (Utils.isString(options.entity)) {
        type = options.type = options.entity;
      } else if (options.entity) {
        type = options.type = Utils.className(options.entity());
      }
    }

    if (type instanceof Function) {
      type = type.name;
    }

    if (['String', 'Number', 'Boolean', 'Array'].includes(type)) {
      type = type.toLowerCase();
    }

    return type;
  }

}
