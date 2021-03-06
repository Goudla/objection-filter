const _ = require('lodash');
require('chai').should();
const testUtils = require('./utils');
const { buildFilter } = require('../src');

const { STRING_SORT } = testUtils;

describe('eager object notation', function () {
  _.each(testUtils.testDatabaseConfigs, function (knexConfig) {
    describe(knexConfig.client, function() {
      let session, Person;

      before(function () {
        session = testUtils.initialize(knexConfig);
        Person = session.models.Person;
      });

      before(function () {
        return testUtils.dropDb(session);
      });

      before(function () {
        return testUtils.createDb(session);
      });

      before(function () {
        return testUtils.insertData(session, { persons: 10, pets: 10, movies: 10 });
      });

      describe('$where on root model', function() {
        it('should filter on the root model', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F01'
                }
              }
            });
          result.length.should.equal(1);
          result[0].firstName.should.equal('F01');
        });
      });

      describe('$where on eager models', function() {
        it('should filter using a single condition', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(['M99']);
        });

        it('should filter using a boolean condition', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { name: 'M99' },
                      { name: 'M98' }
                    ]
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).sort(STRING_SORT).should.deep.equal(['M98', 'M99']);
        });

        it('should filter using a nested boolean condition', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { name: 'M99' },
                      {
                        $or: [
                          { name: 'M98' }
                        ]
                      }
                    ]
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).sort(STRING_SORT).should.deep.equal(['M98', 'M99']);
        });

        it('should filter using a nested condition', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                parent: {
                  movies: {
                    $where: {
                      name: 'M99'
                    }
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.filter(_.map(result, 'parent.movies'), _.identity)
            ), 'name'
          ).should.deep.equal(['M99']);
        });

        it('should filter alongside default eagers', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                },
                pets: true
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(['M99']);
          _.flatten(
            _.map(result, 'pets')
          ).length.should.be.greaterThan(0);
        });

        it('should filter using specified $relation alias', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                favorites: {
                  $relation: 'movies',
                  $where: {
                    name: 'M99'
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'favorites')
            ), 'name'
          ).should.deep.equal(['M99']);
        });

        it('should filter using nested $relation aliases', async () => {
          const result = await buildFilter(Person)
            .build({
              eager: {
                upper: {
                  $relation: 'parent',
                  $where: {
                    firstName: 'F05'
                  },
                  favorites: {
                    $relation: 'movies',
                    $where: {
                      name: 'M49'
                    }
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.filter(_.map(result, 'upper.favorites'), _.identity)
            ), 'name'
          ).should.deep.equal(['M49']);
        });
      });

      describe('root model using root fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F00'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F00'
          ]);
        });

        it('should filter using multiple fields', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  firstName: 'F00',
                  lastName: 'L09'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F00'
          ]);
          result.map(item => item.lastName).should.deep.equal([
            'L09'
          ]);
        });
      });

      describe('eager models using base fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    name: 'M99'
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).should.deep.equal(['M99']);
        });
      });

      describe('root model using related fields', function() {
        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  'movies.name': 'M00'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09'
          ]);
        });

        it('should filter using multiple fields', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  'movies.name': 'M00',
                  'pets.name': 'P90'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09'
          ]);
        });

        it('should filter using root field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                $where: {
                  id: {
                    $gt: 0
                  },
                  'pets.name': 'P90'
                }
              }
            });
          result.map(item => item.firstName).should.deep.equal([
            'F09'
          ]);
        });
      });

      describe('eager models using related fields', function() {
        // Some convenient constants
        const baseSet = [
          'M90',
          'M91',
          'M92',
          'M93',
          'M94',
          'M95',
          'M96',
          'M97',
          'M98',
          'M99'
        ];
        const extendedSet = [
          'M80',
          'M81',
          'M82',
          'M83',
          'M84',
          'M85',
          'M86',
          'M87',
          'M88',
          'M89',
          'M90',
          'M91',
          'M92',
          'M93',
          'M94',
          'M95',
          'M96',
          'M97',
          'M98',
          'M99'
        ];

        it('should filter by a single field', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    'category.name': 'C00'
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).sort(STRING_SORT).should.deep.equal(baseSet);
        });

        it('should filter by using a logical condition', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    $or: [
                      { 'category.name': 'C00' },
                      { 'category.name': 'C01' },
                    ]
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).sort(STRING_SORT).should.deep.equal(extendedSet);
        });

        it('should filter by using a logical condition after property name', async function() {
          const result = await buildFilter(Person)
            .build({
              eager: {
                movies: {
                  $where: {
                    'category.name': {
                      $or: [
                        'C00',
                        'C01'
                      ]
                    }
                  }
                }
              }
            });
          result.length.should.equal(10);
          _.map(
            _.flatten(
              _.map(result, 'movies')
            ), 'name'
          ).sort(STRING_SORT).should.deep.equal(extendedSet);
        });
      });
    });
  });
});
