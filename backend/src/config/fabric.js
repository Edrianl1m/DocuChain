'use strict';

const { connect, signers } = require('@hyperledger/fabric-gateway');
const grpc = require('@grpc/grpc-js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CRYPTO_PATH = process.env.FABRIC_CRYPTO_PATH;
const CHANNEL = process.env.FABRIC_CHANNEL || 'docuchain';
const CHAINCODE = process.env.FABRIC_CHAINCODE || 'docuchain-cc';
const PEER_ENDPOINT = 'peer0.org1.docuchain.local:7051';
const PEER_HOST_ALIAS = 'peer0.org1.docuchain.local';

function getTlsCert() {
  return fs.readFileSync(path.join(CRYPTO_PATH, process.env.FABRIC_PEER_TLS_CERT));
}

function getAdminCert() {
  return fs.readFileSync(path.join(CRYPTO_PATH, process.env.FABRIC_ADMIN_CERT));
}

function getAdminKey() {
  const keyDir = path.join(CRYPTO_PATH, process.env.FABRIC_ADMIN_KEY_PATH);
  const keyFile = fs.readdirSync(keyDir)[0];
  return fs.readFileSync(path.join(keyDir, keyFile));
}

async function newGrpcConnection() {
  const tlsCredentials = grpc.credentials.createSsl(getTlsCert());
  return new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
    'grpc.ssl_target_name_override': PEER_HOST_ALIAS,
  });
}

async function getContract() {
  const client = await newGrpcConnection();
  const gateway = connect({
    client,
    identity: {
      mspId: process.env.FABRIC_MSP_ID || 'Org1MSP',
      credentials: getAdminCert(),
    },
    signer: signers.newPrivateKeySigner(
      crypto.createPrivateKey(getAdminKey())
    ),
  });

  const network = gateway.getNetwork(CHANNEL);
  const contract = network.getContract(CHAINCODE);
  return { gateway, client, contract };
}

async function submitTransaction(fcn, ...args) {
  const { gateway, client, contract } = await getContract();
  try {
    console.log('[Fabric] Submitting:', fcn, args);
    const result = await contract.submitTransaction(fcn, ...args);
    const json = Buffer.from(result).toString();
    console.log('[Fabric] Result:', json);
    return JSON.parse(json);
  } finally {
    gateway.close();
    client.close();
  }
}

async function evaluateTransaction(fcn, ...args) {
  const { gateway, client, contract } = await getContract();
  try {
    console.log('[Fabric] Evaluating:', fcn, args);
    const result = await contract.evaluateTransaction(fcn, ...args);
    const json = Buffer.from(result).toString();
    console.log('[Fabric] Result:', json);
    return JSON.parse(json);
  } finally {
    gateway.close();
    client.close();
  }
}

module.exports = { submitTransaction, evaluateTransaction };