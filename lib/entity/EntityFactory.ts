import { Utils } from '../utils';
import { AnyEntity, EntityData, EntityMetadata, EntityName, Primary } from '../typings';
import { UnitOfWork } from '../unit-of-work';
import { ReferenceType } from './enums';
import { EntityManager } from '..';

export const SCALAR_TYPES = ['string', 'number', 'boolean', 'Date'];

export class EntityFactory {

  private readonly driver = this.em.getDriver();
  private readonly config = this.em.config;
  private readonly metadata = this.em.getMetadata();
  private readonly hydrator = this.config.getHydrator(this, this.em);

  constructor(private readonly unitOfWork: UnitOfWork,
              private readonly em: EntityManager) { }

  create<T extends AnyEntity<T>>(entityName: EntityName<T>, data: EntityData<T>, initialized = true, newEntity = false): T {
    if (Utils.isEntity<T>(data)) {
      return data;
    }

    entityName = Utils.className(entityName);
    const meta = this.metadata.get(entityName);
    meta.primaryKeys.forEach(pk => this.denormalizePrimaryKey(data, pk));
    const entity = this.createEntity(data, meta);

    if (initialized && !Utils.isEntity(data)) {
      this.hydrator.hydrate(entity, meta, data, newEntity);
    }

    if (initialized) {
      delete entity.__initialized;
    } else {
      entity.__initialized = initialized;
    }

    this.runHooks(entity, meta);

    return entity;
  }

  createReference<T extends AnyEntity<T>>(entityName: EntityName<T>, id: Primary<T> | Primary<T>[] | Record<string, Primary<T>>): T {
    entityName = Utils.className(entityName);
    const meta = this.metadata.get(entityName);

    if (Array.isArray(id)) {
      id = Utils.getPrimaryKeyCondFromArray(id, meta.primaryKeys);
    }

    const pks = Utils.getOrderedPrimaryKeys<T>(id, meta);

    if (Utils.isPrimaryKey(id)) {
      id = { [meta.primaryKeys[0]]: id as Primary<T> };
    }

    if (this.unitOfWork.getById(entityName, pks)) {
      return this.unitOfWork.getById<T>(entityName, pks);
    }

    return this.create<T>(entityName, id as EntityData<T>, false);
  }

  private createEntity<T extends AnyEntity<T>>(data: EntityData<T>, meta: EntityMetadata<T>): T {
    const Entity = this.metadata.get<T>(meta.name).class;
    const pks = Utils.getOrderedPrimaryKeys<T>(data, meta);

    if (meta.primaryKeys.some(pk => !data[pk as keyof T])) {
      const params = this.extractConstructorParams<T>(meta, data);
      meta.constructorParams.forEach(prop => delete data[prop]);

      // creates new instance via constructor as this is the new entity
      return new Entity(...params);
    }

    if (this.unitOfWork.getById<T>(meta.name, pks)) {
      return this.unitOfWork.getById<T>(meta.name, pks);
    }

    // creates new entity instance, bypassing constructor call as its already persisted entity
    const entity = Object.create(Entity.prototype);

    meta.primaryKeys.forEach(pk => {
      const prop = meta.properties[pk];

      if (prop.reference === ReferenceType.SCALAR) {
        entity[pk] = data[pk];
      } else {
        entity[pk] = this.createReference(prop.type, data[pk]);
      }
    });

    return entity;
  }

  /**
   * denormalize PK to value required by driver (e.g. ObjectId)
   */
  private denormalizePrimaryKey<T extends AnyEntity<T>>(data: EntityData<T>, primaryKey: string): void {
    const platform = this.driver.getPlatform();
    const pk = platform.getSerializedPrimaryKeyField(primaryKey);

    if (data[pk] || data[primaryKey]) {
      const id = platform.denormalizePrimaryKey(data[pk] || data[primaryKey]);
      delete data[pk];
      data[primaryKey as keyof T] = id as Primary<T> & T[keyof T];
    }
  }

  /**
   * returns parameters for entity constructor, creating references from plain ids
   */
  private extractConstructorParams<T extends AnyEntity<T>>(meta: EntityMetadata<T>, data: EntityData<T>): T[keyof T][] {
    return meta.constructorParams.map(k => {
      if (meta.properties[k] && [ReferenceType.MANY_TO_ONE, ReferenceType.ONE_TO_ONE].includes(meta.properties[k].reference) && data[k]) {
        const entity = this.unitOfWork.getById(meta.properties[k].type, data[k]) as T[keyof T];

        if (entity) {
          return entity;
        }

        if (Utils.isEntity<T>(data[k])) {
          return data[k];
        }

        return this.createReference(meta.properties[k].type, data[k]);
      }

      return data[k];
    });
  }

  private runHooks<T extends AnyEntity<T>>(entity: T, meta: EntityMetadata<T>): void {
    if (meta.hooks && meta.hooks.onInit && meta.hooks.onInit.length > 0) {
      meta.hooks.onInit.forEach(hook => (entity[hook] as unknown as () => void)());
    }
  }

}
