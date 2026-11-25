'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/** One run of the integrity scan (scheduled or started by an admin). */
const IntegrityScan = sequelize.define('IntegrityScan', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  trigger: { type: DataTypes.STRING(20), allowNull: false }, // scheduled | manual | startup
  startedBy: DataTypes.STRING(100),
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'running' }, // running | done | failed
  total: { type: DataTypes.INTEGER, defaultValue: 0 },
  passed: { type: DataTypes.INTEGER, defaultValue: 0 },
  failed: { type: DataTypes.INTEGER, defaultValue: 0 },
  unverified: { type: DataTypes.INTEGER, defaultValue: 0 },
  errors: { type: DataTypes.INTEGER, defaultValue: 0 },
  error: DataTypes.STRING(500),
  finishedAt: DataTypes.DATE,
}, {
  tableName: 'integrity_scans',
  timestamps: true,
});

module.exports = IntegrityScan;
