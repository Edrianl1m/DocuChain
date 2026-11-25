'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Audit log for anonymous visitors of the public resolutions page.
 * Public views, downloads and verifications are logged here only;
 * they never write transactions to the blockchain ledger.
 */
const PublicAccessLog = sequelize.define('PublicAccessLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  action: {
    type: DataTypes.ENUM('view', 'download', 'verify'),
    allowNull: false,
  },
  docId: DataTypes.STRING(64),
  result: DataTypes.STRING(50),
  providedHash: DataTypes.STRING(64),
  ip: DataTypes.STRING(100),
  userAgent: DataTypes.STRING(255),
}, {
  tableName: 'public_access_logs',
  timestamps: true,
  updatedAt: false,
});

module.exports = PublicAccessLog;
