'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Audit trail of every integrity verification (pass or fail): uploads,
 * downloads, views, manual verifications, public page access and the
 * scheduled integrity scan.
 */
const IntegrityLog = sequelize.define('IntegrityLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  docId: DataTypes.STRING(64),
  filename: DataTypes.STRING(255),
  // register | download | view | verify | public_view | public_download | public_preview | public_verify | scan | metadata_update
  action: { type: DataTypes.STRING(30), allowNull: false },
  // pass | fail | warning | unverified | error
  result: { type: DataTypes.STRING(20), allowNull: false },
  fileIntact: DataTypes.BOOLEAN,
  metadataIntact: DataTypes.BOOLEAN,
  reasons: DataTypes.STRING(255),
  expectedHash: DataTypes.STRING(64),
  computedHash: DataTypes.STRING(64),
  expectedMetadataHash: DataTypes.STRING(64),
  computedMetadataHash: DataTypes.STRING(64),
  // true when the chaincode wrote a status change (tampered / restored) to the ledger
  ledgerRecorded: { type: DataTypes.BOOLEAN, defaultValue: false },
  blocked: { type: DataTypes.BOOLEAN, defaultValue: false },
  message: DataTypes.STRING(500),
  actor: DataTypes.STRING(100),
  ip: DataTypes.STRING(100),
  scanId: DataTypes.UUID,
}, {
  tableName: 'integrity_logs',
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['docId'] }, { fields: ['createdAt'] }, { fields: ['scanId'] }],
});

module.exports = IntegrityLog;
