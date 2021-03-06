const mysql = require('node-async-mysql');
const commFunc = require('./comm_func');

const queryFormat = Symbol('queryFormat');

class MysqlClient {
  constructor(mysqlConfig, isCamelCase = true) {
    this.mysqlPool = new mysql.Pool(mysqlConfig);
    this.isCamelCase = isCamelCase;
  }

  [queryFormat](query, values) {
    if (!values) return query;
    return query.replace(/\:(\w+_?)+/g, ((txt, key) => {
      if (values.hasOwnProperty(key) || values.hasOwnProperty(commFunc.toCamelCase(key))) {
        return mysql.escape(values[key] || values[commFunc.toCamelCase(key)]);
      }
      return txt;
    }));
  }

  /* sql, params */
  async one(sql, params) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();
      connection.config.queryFormat = this[queryFormat];
      const results = await connection.query(`${sql} limit 1`, params);
      const result = (results && results.length > 0) ? results[0] : undefined;
      return this.isCamelCase ? commFunc.camelCaseObjectKeys(result) : result;
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        await connection.release();
      }
    }
  }

  /* sql, params */
  async all(sql, params) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();
      connection.config.queryFormat = this[queryFormat];
      const results = await connection.query(sql, params);
      return this.isCamelCase ? results.map(m => commFunc.camelCaseObjectKeys(m)) : results;
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        await connection.release();
      }
    }
  }

  /* sql, params */
  async update(sql, params) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();
      connection.config.queryFormat = this[queryFormat];
      const results = await connection.query(sql, params);
      return (results && results.hasOwnProperty('changedRows')) ? results.changedRows : 0;
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        await connection.release();
      }
    }
  }

  /* sql, params */
  async insert(sql, params) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();
      connection.config.queryFormat = this[queryFormat];
      const results = await connection.query(sql, params);
      return (results && results.hasOwnProperty('insertId')) ? results.insertId : 0;
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        await connection.release();
      }
    }
  }

  /* sql, params */
  async del(sql, params) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();
      connection.config.queryFormat = this[queryFormat];
      const results = await connection.query(sql, params);
      return (results && results.hasOwnProperty('changedRows')) ? results.changedRows : 0;
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        await connection.release();
      }
    }
  }

  /* sql, params */
  async queryForPagination(sql, params) {
    const sqlCount = `select count(1) as count from (${sql}) sqltotal`;
    const sqlLimit = (params && params.hasOwnProperty('pagination') && !params.pagination) ? '' : ' limit :offset, :pageSize';
    const [countResult, rowsResult] = await Promise.all([
      this.one(sqlCount, params),
      this.all((sql + sqlLimit), params),
    ]);

    const total = countResult ? countResult.count : 0;
    return {
      total: total,
      rows: rowsResult || [],
    };
  }

  async executeTransaction(sqlTasks) {
    let connection;
    try {
      connection = await this.mysqlPool.getConn();

      await connection.beginTran();
      connection.config.queryFormat = this[queryFormat];

      const taskResult = {};
      for (const [key, sqlTask] of sqlTasks.entries()) {
        let result = await connection.query(sqlTask.sql, sqlTask.params);
        result = (result && result.length > 0) ? result[0] : undefined;
        taskResult[sqlTask.field ? sqlTask.field : key] = result;
      }

      await connection.commit();
      await connection.release();

      return taskResult;
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (ex) {
          console.error(ex);
        } finally {
          await connection.release();
        }
      }
      throw err;
    }
  }
}

module.exports = MysqlClient;
