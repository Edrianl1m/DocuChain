'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Public-page settings for a document registered on the ledger.
 * The ledger stays the source of truth for hashes; this table only holds
 * what the Records Office chooses to show on the public resolutions page.
 */
const DocumentPublication = sequelize.define('DocumentPublication', {
  docId: {
    type: DataTypes.STRING(64),
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  resolutionNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  resolutionDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Confidential documents can never be published, downloaded or verified publicly
  isConfidential: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Records filing: the calendar year and quarter (1-4) the document is
  // filed under, e.g. 2026 Q3. Used by the staff Repository to find a
  // document quickly when the Board or an office requests it. Defaults to
  // the quarter of the resolution / document date. Not part of the
  // metadata hash, so re-filing a document never looks like tampering.
  recordYear: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  recordQuarter: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 4 },
  },
  filename: DataTypes.STRING(255),
  sha256: DataTypes.STRING(64),
  department: DataTypes.STRING(100),
  docType: DataTypes.STRING(100),
  uploader: DataTypes.STRING(100),
  txId: DataTypes.STRING(128),
  blockNumber: DataTypes.INTEGER,
  publishedBy: DataTypes.STRING(100),
  publishedAt: DataTypes.DATE,
}, {
  tableName: 'document_publications',
  timestamps: true,
});

module.exports = DocumentPublication;
