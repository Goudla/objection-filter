/**
 * A wrapper around the objection.js model class
 * For 'where' you cannot have combinations of properties in a single AND condition
 * e.g.
 * {
 *   $and: {
 *     'a.b.c': 1,
 *     'b.e': 2
 *   },
 *   $or: [
 *      {}
 *   ]
 * }
 *
 * However, for 'require' conditions, this might be possible since ALL variables exist
 * in the same scope, since there's a join
 */
const _ = require('lodash');
const {
  sliceRelation,
  Operations
} = require('./utils');
const {
  createRelationExpression
} = require('./ExpressionBuilder');

module.exports = class FilterQueryBuilder {
  /**
   * @param {Model} Model
   * @param {Transaction} trx
   * @param {Object} options.operators Custom operator handlers
   */
  constructor(Model, trx, options = {}) {
    this.Model = Model;
    this._builder = Model.query(trx);

    // Initialize custom operators
    const { operators = {} } = options;

    // Initialize instance specific utilities
    this.utils = Operations({ operators });
  }

  build(params = {}) {
    const {
      fields,
      limit,
      offset,
      order,
      eager
    } = params;

    applyFields(fields, this._builder);
    applyWhere(params.where, this._builder, this.utils);
    applyRequire(params.require, this._builder, this.utils);
    applyOrder(order, this._builder);

    // Clone the query before adding pagination functions in case of counting
    this.countQuery = this._builder.clone();

    applyEager(eager, this._builder, this.utils);
    applyLimit(limit, offset, this._builder);

    return this._builder;
  }

  count() {
    const query = this
      .countQuery
      .count('* AS count')
      .first();

    return query.then(result => result.count);
  }

  /**
   * @param {String} exp The objection.js eager expression
   */
  allowEager(eagerExpression) {
    this._builder.allowEager(eagerExpression);

    return this;
  }
};

const applyEager = function (eager, builder, utils = {}) {
  const { applyEagerObject } = utils;

  if (typeof eager === 'object')
    return applyEagerObject(eager, builder);

  builder.eager(eager);
};
module.exports.applyEager = applyEager;

/**
 * Apply an entire require expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * Do a first pass on the fields to create an objectionjs RelationExpression
 * This prevents joining tables multiple times, and optimizes number of joins
 * @param {Object} filter
 * @param {QueryBuilder} builder The root query builder
 * @param {Function} applyOperations Handler for applying operations
 */
const applyRequire = function (filter = {}, builder, utils = {}) {
  const { applyOperations, handleProperty } = utils;

  if (Object.keys(filter).length === 0) return builder;
  const Model = builder._modelClass;
  const idColumn = `${Model.tableName}.${Model.idColumn}`;

  const filterQuery = Model
    .query()
    .distinct(idColumn);

  // Do all the joins at once
  const relationExpression = createRelationExpression(Object.keys(filter));
  filterQuery.joinRelation(relationExpression);

  // TODO: Don't join if no related properties were used anywhere?
  const propertiesSet = applyOperations(
    filter,
    filterQuery,
    false,
    function(propertyName) {
      const {
        fullyQualifiedProperty
      } = sliceRelation(propertyName);

      return fullyQualifiedProperty;
    }
  );

  // TODO: Do all the joins based on all used properties
  console.log('set', propertiesSet);
  filterQuery.joinRelation(createRelationExpression(propertiesSet));

  const filterQueryAlias = 'filter_query';
  builder.innerJoin(
    filterQuery.as(filterQueryAlias),
    idColumn,
    `${filterQueryAlias}.${Model.idColumn}`
  );

  return builder;
};
module.exports.applyRequire = applyRequire;

/**
 * Apply an entire where expression to the query builder
 * e.g. { "prop1": { "$like": "A" }, "prop2": { "$in": [1] } }
 * For now it only supports a single operation for each property
 * but in reality, it should allow an AND of multiple operations
 * @param {Object} filter The filter object
 * @param {QueryBuilder} builder The root query builder
 * @param {Function} applyOperations Handler for applying operations
 */
const applyWhere = function (filter = {}, builder, utils = {}) {
  const { applyOperations, handleProperty } = utils;
  const Model = builder._modelClass;

  _.forEach(filter, (andExpression, property) => {
    const { relationName, propertyName } = sliceRelation(property);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedProperty = `${Model.tableName}.${propertyName}`;
      return handleProperty(fullyQualifiedProperty, andExpression, builder);
    }

    // Eager query fields should include the eager model table name
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedProperty = `${eagerBuilder._modelClass.tableName}.${propertyName}`;
      handleProperty(fullyQualifiedProperty, andExpression, eagerBuilder);
    });
  });

  return builder;
};
module.exports.applyWhere = applyWhere;

/**
 * Order the result by a root model field or order related models
 * Related properties are ordered locally (within the subquery) and not globally
 * e.g. order = "name desc, city.country.name asc"
 * @param {String} order An comma delimited order expression
 * @param {QueryBuilder} builder The root query builder
 */
const applyOrder = function (order, builder) {
  if (!order) return;
  const Model = builder._modelClass;

  order.split(',').forEach(orderStatement => {
    const [orderProperty, direction = 'asc'] = orderStatement.split(' ');
    const { propertyName, relationName } = sliceRelation(orderProperty);

    if (!relationName) {
      // Root level where should include the root table name
      const fullyQualifiedColumn = `${Model.tableName}.${propertyName}`;
      return builder.orderBy(fullyQualifiedColumn, direction);
    }

    // For now, only allow sub-query ordering of eager expressions
    builder.modifyEager(relationName, eagerBuilder => {
      const fullyQualifiedColumn = `${eagerBuilder._modelClass.tableName}.${propertyName}`;
      eagerBuilder.orderBy(fullyQualifiedColumn, direction);
    });
  });

  return builder;
};
module.exports.applyOrder = applyOrder;

/**
 * Based on a relation name, select a subset of fields. Do nothing if there are no fields
 * @param {Builder} builder An instance of a knex builder
 * @param {Array<String>} fields A list of fields to select
  */
const selectFields = (fields = [], builder, relationName) => {
  if (fields.length === 0) return;

  if (!relationName)
    return builder.select(fields);

  builder.modifyEager(relationName, eagerQueryBuilder => {
    eagerQueryBuilder.select(fields.map(field => `${eagerQueryBuilder._modelClass.tableName}.${field}`));
  });
};


/**
 * Select a limited set of fields. Use dot notation to limit eagerly loaded models.
 * @param {Array<String>} fields An array of dot notation fields
 * @param {QueryBuilder} builder The root query builder
 */
const applyFields = function (fields = [], builder) {
  const Model = builder._modelClass;

  // Group fields by relation e.g. ["a.b.name", "a.b.id"] => {"a.b": ["name", "id"]}
  const rootFields = []; // Fields on the root model
  const fieldsByRelation = fields.reduce((obj, fieldName) => {
    const { propertyName, relationName } = sliceRelation(fieldName);
    if (!relationName) {
      rootFields.push(`${Model.tableName}.${propertyName}`);
    } else {
      // Push it into an array keyed by relationName
      obj[relationName] = obj[relationName] || [];
      obj[relationName].push(propertyName);
    }
    return obj;
  }, {});

  // Root fields
  selectFields(rootFields, builder);

  // Related fields
  _.map(fieldsByRelation, (fields, relationName) => selectFields(
    fields, builder, relationName
  ));

  return builder;
};
module.exports.applyFields = applyFields;

const applyLimit = function (limit, offset, builder) {
  if (limit)
    builder.limit(limit);
  if (offset)
    builder.offset(offset);

  return builder;
};
module.exports.applyLimit = applyLimit;