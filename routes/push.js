const JSE = global.JSE;
const jseCommands = require("./../modules/commands.js");
const express = require('express');

const router = express.Router();

/**
 * @name /push/requesttransfer/*
 * @description Request a transfer data object to be signed client-side
 * @memberof module:jseRouter
 */
router.post('/requesttransfer/*', function (req, res) {
	const session = req.body.session;
	const toEmail = JSE.jseFunctions.cleanString(req.body.toUser).toLowerCase(); // safe, only used for string comparison
	const toAmount = JSE.jseFunctions.round(parseFloat(req.body.toAmount));
	const toReference = JSE.jseFunctions.cleanString(req.body.toReference).substring(0, 255);
	JSE.jseDataIO.getCredentialsBySession(session,function(goodCredentials) {
		JSE.jseDataIO.getUserByEmail(toEmail,function(toUser) {
			const dataToSign = {};
			dataToSign.publicKey = goodCredentials.publicKey;
			dataToSign.toPublicKey = toUser.publicKey;
			dataToSign.user1 = goodCredentials.uid;
			dataToSign.user2 = toUser.uid;
			dataToSign.command = 'transfer';
			dataToSign.value = toAmount;
			const transactionReference = toReference.substr(0, 255);
			JSE.jseDataIO.setupNewTransaction(transactionReference, function(tid) {
				dataToSign.tid = tid;
				dataToSign.ts = new Date().getTime();
				const dataString = JSON.stringify(dataToSign);
				res.send(dataString);
			});
		}, function() {
			res.status(400).send('{"fail":1,"notification":"Transfer Failed: User receiving funds unknown"}');
		});
	}, function() {
		res.status(401).send('{"fail":1,"notification":"No match for session variable in the database, please try entering your details again"}');
	});
});

/**
 * @name /push/requestexport/*
 * @description Request a export data object to be signed client-side
 * @memberof module:jseRouter
 */
router.post('/requestexport/*', function (req, res) {
	const session = req.body.session;
	const exportAmount = JSE.jseFunctions.round(parseFloat(req.body.exportAmount));
	JSE.jseDataIO.getCredentialsBySession(session,function(goodCredentials) {
		const dataToSign = {};
		dataToSign.publicKey = goodCredentials.publicKey;
		dataToSign.command = 'export';
		dataToSign.ts = new Date().getTime();
		dataToSign.value = exportAmount;
		dataToSign.user1 = goodCredentials.uid;
		const dataString = JSON.stringify(dataToSign);
		res.send(dataString);
	}, function() {
		res.status(401).send('{"fail":1,"notification":"No match for session variable in the database, please try entering your details again"}');
	});
});

/**
 * @name /push/data/*
 * @description SUbmit signed data for inclusion in to blockchain
 * @memberof module:jseRouter
 */
router.post('/data/*', function (req, res) {
	if (!req.body.data || !req.body.publicKey || !req.body.signature) {
		res.status(400).send('{"fail":1,"notification":"Transfer Failed: Missing Data"}');
		return false;
	}
	const signed = {};
	signed.data = req.body.data;
	signed.publicKey = req.body.publicKey;
	signed.signature = req.body.signature;
	jseCommands.dataPush(signed, function(dataPushResult) {
		if (dataPushResult.substr(0,9) === '{"fail":1') {
			res.status(400).send(dataPushResult); //fail
		} else {
			res.send(dataPushResult); // success
		}
	});
	return false;
});

/**
 * @name /push/import/*
 * @description Request import of a coin code
 * @memberof module:jseRouter
 */
router.post('/import/*', function (req, res) {
	const session = req.body.session;
	const coinCode = JSE.jseFunctions.cleanString(req.body.coinCode);
	JSE.jseDataIO.getCredentialsBySession(session,function(goodCredentials) {
		jseCommands.importCoinCode(coinCode, goodCredentials.uid, function(returnJSON) {
			if (returnJSON.substr(0,9) === '{"fail":1') {
				res.status(400).send(returnJSON);
			} else {
				res.send(returnJSON);
			}
		});
	}, function() {
		res.status(401).send('{"fail":1,"notification":"No match for session variable in the database, please try entering your details again"}');
	});
});

module.exports = router;