/**
 * @module jseCommands
 * @description Commands which are core to transferring funds, pushing data on to the blockchain and verifying transfers and exports.
 * <h5>Exported</h5>
 * <ul>
 * <li>dataPush</li>
 * <li>verifyTransfer</li>
 * <li>verifyExport</li>
 * <li>importCoinCode</li>
 * </ul>
 */

const JSE = global.JSE;
const crypto = require('crypto');
const eccrypto = require('eccrypto');

const jseCommands = {

	/**
	 * @method <h2>dataPush</h2>
	 * @description Verify and push data to the current block
	 * @param {object} signedDataObject transaction which has been signed from the client
	 * @param {function} callback returns the JSON result to the calling function
	 */
	dataPush(signedDataObject, callback) {
		if (!signedDataObject.publicKey || !signedDataObject.data || !signedDataObject.signature) {
			//console.log(JSON.stringify(signedDataObject));
			callback('{"fail":1,"notification":"Failed: Error 684 - Signature Data Missing"}');
			return false;
		}

		JSE.jseFunctions.verifyData(signedDataObject, function(signedDataObject2) {
			let dataObject = {};
			try {
				const parsedData = JSON.parse(signedDataObject2.data);
				dataObject = Object.assign(parsedData, signedDataObject2); // merge two objects, signedDataObject2 overwrites parsedData just in case.
			} catch (ex) {
				callback('{"fail":1,"notification":"Failed: Error 694 - Signature Data Missing"}');
				return false;
			}

			dataObject.received = new Date().getTime();
			dataObject.host = JSE.host;

			if (dataObject.command === 'transfer') {
				jseCommands.verifyTransfer(dataObject,function(failCheckJSON) {
					const failCheck = JSON.parse(failCheckJSON);
					if (failCheck.fail) {
						callback(failCheckJSON);
					} else {
						const nowTS = new Date().getTime();
						let lastBlockTime = nowTS;
						if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime > 1500508800000) {
							lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime;
						} else if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime > 1500508800000) {
							lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime + 30000;
						}
						let timeTillConfirmation = (lastBlockTime + 30000) - nowTS;
						if (timeTillConfirmation > 30000) timeTillConfirmation = 30000;
						if (timeTillConfirmation < 0) timeTillConfirmation = 29999;
						callback('{"success":1, "notification": "Transfer Successful","timeTillConfirmation":'+timeTillConfirmation+'}');
						JSE.jseFunctions.transferNotificationEmails(dataObject.user1,dataObject.user2,dataObject.value);
					}
				});
			} else if (dataObject.command === 'export') {
				const keyPair = JSE.jseFunctions.createKeyPair();
				dataObject.coinCodePublicKey = keyPair.publicKey;
				jseCommands.verifyExport(dataObject,function(failCheckJSON) {
					const failCheck = JSON.parse(failCheckJSON);
					if (failCheck.fail) {
						callback(failCheckJSON);
					} else {
						const eCoin = {};
						eCoin.coinCode = keyPair.privateKey;
						eCoin.coinCodePublicKey = keyPair.publicKey; // not used as of 13/9/17, might come in useful later
						eCoin.uid = dataObject.user1;
						eCoin.value = dataObject.value;
						eCoin.used = false;
						eCoin.ts = new Date().getTime();

						JSE.jseDataIO.setVariable('exported/'+eCoin.coinCode,eCoin);
						JSE.jseDataIO.pushVariable('lookupExports/'+eCoin.uid,eCoin.coinCode,function(pushRef) {});
						const nowTS = new Date().getTime();
						let lastBlockTime = nowTS;
						if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime > 1500508800000) {
							lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime;
						} else if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime > 1500508800000) {
							lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime + 30000;
						}
						let timeTillConfirmation = (lastBlockTime + 30000) - nowTS;
						if (timeTillConfirmation > 30000) timeTillConfirmation = 30000;
						if (timeTillConfirmation < 0) timeTillConfirmation = 29999;
						callback('{"success":1,"coinCode":"' + eCoin.coinCode + '","notification":"Export Successful","timeTillConfirmation":'+timeTillConfirmation+'}');
						JSE.jseFunctions.exportNotificationEmail(dataObject.user1,dataObject.value);
					}
				});
			} else {
				callback('{"fail":1,"notification":"Failed: Error 706 - Unknown Or Missing Command"}');
				return false;
			}
			return false;
		}, function (signedDataObject3) {
			console.log('unverified');
			callback('{"fail":1,"notification":"Failed: Error 709 - Could Not Verify Data Signature"}');
			return false;
		});
		return false;
	},

	/**
	 * @method <h2>verifyTransfer</h2>
	 * @description Check a transfer is valid
	 * @param {object} dataObject transaction which has been signed from the client
	 * @param {function} callback2 returns the JSON result to the calling function
	 */
	verifyTransfer(dataObject,callback2) {
		JSE.jseDataIO.checkUserByPublicKey(dataObject.publicKey,function(goodCredentials) {
			JSE.jseDataIO.setVariable('locked/'+goodCredentials.uid,true); // lasts till next block to avoid double spending
			if (JSE.lockedUIDs.indexOf(goodCredentials.uid) > -1 && goodCredentials.uid !== 0) {
				callback2('{"fail":1,"notification":"Transfer Failed: Account '+goodCredentials.uid+' locked pending recent transaction, please try again in 20 seconds"}');
				return false;
			}
			JSE.lockedUIDs.push(goodCredentials.uid);
			JSE.jseDataIO.getUserByPublicKey(dataObject.toPublicKey,function(toUser) {
				if (!dataObject.value) {
					callback2('{"fail":1,"notification":"Transfer Failed: No value given"}');
					return false;
				}
				const value = JSE.jseFunctions.round(parseFloat(dataObject.value)); // can't clean string because it's not a string
				if (value !== dataObject.value) {
					callback2('{"fail":1,"notification":"Transfer Failed: Value does not parse security check"}');
				} else if (goodCredentials.balance < value) {
					callback2('{"fail":1,"notification":"Transfer Failed: Insufficient Funds"}');
				} else if (goodCredentials.locked && goodCredentials.uid !== 0) {
					callback2('{"fail":1,"notification":"Transfer Failed: Account locked pending recent transaction, please try again in 20 seconds"}');
				} else if (goodCredentials.suspended && goodCredentials.suspended !== 0) {
					callback2('{"fail":1,"notification":"Transfer Failed: This user account has been suspended. Please contact investigations@jsecoin.com"}');
				} else if (value < 0.000001) {
					callback2('{"fail":1,"notification":"Transfer Failed: Transfer value is negative or too small"}');
				} else if (value === 0 || value === null || value === '' || typeof value === 'undefined') {
					callback2('{"fail":1,"notification":"Transfer Failed: Transfer value zero"}');
				} else if (toUser.uid === goodCredentials.uid) {
					callback2('{"fail":1,"notification":"Transfer Failed: You cannot send money to your own account"}');
				} else if (dataObject.user1 !== goodCredentials.uid) {
					callback2('{"fail":1,"notification":"Transfer Failed: Data object user1 does not match public key"}');
				} else if (dataObject.user2 !== toUser.uid) {
					callback2('{"fail":1,"notification":"Transfer Failed: Data object user2 does not match public key"}');
				} else if (dataObject.publicKey !== goodCredentials.publicKey) {
					callback2('{"fail":1,"notification":"Transfer Failed: Data object user1pk does not match public key"}');
				} else if (dataObject.toPublicKey !== toUser.publicKey) {
					callback2('{"fail":1,"notification":"Transfer Failed: Data object user2pk does not match public key"}');
				} else {
					//console.log('asdf.'+JSON.stringify(dataObject));
					JSE.jseDataIO.pushBlockData(dataObject,function(blockData) {
						JSE.jseDataIO.minusBalance(goodCredentials.uid,value);
						JSE.jseDataIO.addBalance(toUser.uid,value);
						const dataObject2 = JSON.parse(JSON.stringify(dataObject)); // clone don't reference
						if (dataObject2.private !== true) {
							dataObject2.user1email = goodCredentials.email;
							dataObject2.user2email = toUser.email;
						}
						JSE.jseDataIO.getTransactionReference(dataObject.tid,function(transactionReference) {
							dataObject2.reference = transactionReference;
							JSE.jseDataIO.pushVariable('history/'+toUser.uid,dataObject2,function(pushRef) {});
							const dataObject3 = JSON.parse(JSON.stringify(dataObject2)); // clone don't reference
							dataObject3.value = value / -1; // turn negative
							if (goodCredentials.uid !== 0 || dataObject2.value > 250) { // Stop Distribution Account History getting filled with referrals and welcome bonuses
								JSE.jseDataIO.pushVariable('history/'+goodCredentials.uid,dataObject3,function(pushRef) {});
							}
							callback2('{"success":1}');
						});
					});
				}
				return false;
			}, function() {
				callback2('{"fail":1,"notification":"Transfer Failed: User receiving funds unknown"}');
			});
			return false;
		}, function() {
			callback2('{"fail":1,"notification":"Transfer Failed: User public key credentials could not be matched"}');
		});
	},

	/**
	 * @method <h2>verifyExport</h2>
	 * @description Check a export before writing it to the blockchain
	 * @param {object} dataObject transaction which has been signed from the client
	 * @param {function} callback3 returns the JSON result to the calling function
	 */
	verifyExport(dataObject,callback3) {
		JSE.jseDataIO.checkUserByPublicKey(dataObject.publicKey,function(goodCredentials) {
			JSE.jseDataIO.setVariable('locked/'+goodCredentials.uid,true);
			if (JSE.lockedUIDs.indexOf(goodCredentials.uid) > -1 && goodCredentials.uid !== 0) {
				callback3('{"fail":1,"notification":"Export Failed: Account '+goodCredentials.uid+' locked pending recent transaction, please try again in 20 seconds"}');
				return false;
			}
			JSE.lockedUIDs.push(goodCredentials.uid);
			if (!dataObject.value) {
				callback3('{"fail":1,"notification":"Export Failed: No value provided"}');
				return false;
			}
			const value = JSE.jseFunctions.round(parseFloat(dataObject.value)); // can't clean string because it's not a string
			if (value !== dataObject.value) {
				callback3('{"fail":1,"notification":"Export Failed: Security check on value/amount failed"}');
				return false;
			}
			if (goodCredentials.balance < value) {
				callback3('{"fail":1,"notification":"Export Failed: Insufficient Funds"}');
			} else if (goodCredentials.locked && goodCredentials.uid !== 0) {
				callback3('{"fail":1,"notification":"Export Failed: Account locked pending recent transaction, please try again in 20 seconds"}');
				} else if (goodCredentials.suspended && goodCredentials.suspended !== 0) {
				callback3('{"fail":1,"notification":"Export Failed: This user account has been suspended. Please contact investigations@jsecoin.com"}');
			} else if (value < 0.000001) {
				callback3('{"fail":1,"notification":"Export Failed: Transfer value is negative or too small"}');
			} else if (value === 0 || value === null || value === '' || typeof value === 'undefined') {
				callback3('{"fail":1,"notification":"Export Failed: Transfer value zero"}');
			} else if (dataObject.user1 !== goodCredentials.uid) {
				callback3('{"fail":1,"notification":"Export Failed: Data object user1 does not match public key"}');
			} else if (dataObject.publicKey !== goodCredentials.publicKey) {
				callback3('{"fail":1,"notification":"Export Failed: Data object user1pk does not match public key"}');
			} else {
				JSE.jseDataIO.pushBlockData(dataObject,function(blockData) {
					JSE.jseDataIO.minusBalance(goodCredentials.uid,value);
					const dataObject2 = JSON.parse(JSON.stringify(dataObject)); // clone don't reference
					dataObject2.user1email = goodCredentials.email;
					JSE.jseDataIO.pushVariable('history/'+goodCredentials.uid,dataObject2,function(pushRef) {});
					callback3('{"success":1}');
				});
			}
			return false;
		}, function() {
			callback3('{"fail":1,"notification":"Export Failed: User public key credentials could not be matched"}');
		});
	},

	/**
	 * @method <h2>importCoinCode</h2>
	 * @description Import coincode to account.uid, callback is a res(sendJSON)
	 * @param {string} coinCode A private key which is used to export tokens
	 * @param {number} uid user id of client importing tokens
	 * @param {function} callback4 returns the JSON result to the calling function
	 */
	importCoinCode(coinCode, uid, callback4) {
		JSE.jseDataIO.getUserByUID(uid,function(quickLookup) {
			JSE.jseDataIO.checkUserByPublicKey(quickLookup.publicKey,function(goodCredentials) {
				JSE.jseDataIO.setVariable('locked/'+goodCredentials.uid,true);
				if (JSE.lockedUIDs.indexOf(goodCredentials.uid) > -1 && goodCredentials.uid !== 0) {
					callback4('{"fail":1,"notification":"Import Failed: Account '+goodCredentials.uid+' locked pending recent transaction, please try again in 20 seconds"}');
					return false;
				}
				JSE.lockedUIDs.push(goodCredentials.uid);
				const safeCoinCode = JSE.jseDataIO.genSafeKey(coinCode);
				JSE.jseDataIO.getVariable('exported/'+safeCoinCode,function(coinObject) {
					// allow JSE Distribution to inport new coins
					if (uid === 0) {
						JSE.jseDataIO.addBalance(0,parseFloat(coinCode)); // coinCode is value
						callback4('{"success":1,"value":"' + parseFloat(coinCode) + '"}');
					} else if (coinObject === null) {
						callback4('{"fail":1,"notification":"Import Failed: Coin Code Not Recognized"}');
					} else if (goodCredentials.locked && goodCredentials.uid !== 0) {
						callback4('{"fail":1,"notification":"Import Failed: Account locked pending recent transaction, please try again in 20 seconds"}');
					} else if (coinObject.used === true) {
						callback4('{"fail":1,"notification":"Import Failed: Coin Code Used"}');
					} else if (typeof coinObject.coinCode === 'undefined') {
						console.log('Error modules/commands.js 192: coinCode undefined uid:'+goodCredentials.uid);
						callback4('{"fail":1,"notification":"Import Failed: Coin Code Error"}');
					} else if (uid !== goodCredentials.uid) {
						callback4('{"fail":1,"notification":"Import Failed: Data object user1 does not match public key"}');
					} else {
						const newData = {};
						newData.command = 'import';
						newData.user1 = goodCredentials.uid;
						newData.publicKey = goodCredentials.publicKey;
						newData.coinCode = coinObject.coinCode;
						newData.exportedBy = coinObject.uid || 'unknown';
						newData.value = JSE.jseFunctions.round(parseFloat(coinObject.value));
						newData.ts = new Date().getTime();
						JSE.jseDataIO.pushBlockData(newData,function(blockData) {
							JSE.jseDataIO.setVariable('exported/'+coinObject.coinCode+'/used',true);
							JSE.jseDataIO.addBalance(goodCredentials.uid,newData.value);
							JSE.jseDataIO.setVariable('exported/'+coinObject.coinCode+'/usedTS',newData.ts);
							JSE.jseDataIO.setVariable('exported/'+coinObject.coinCode+'/usedBy',goodCredentials.uid);
							JSE.jseDataIO.pushVariable('history/'+goodCredentials.uid,blockData,function(pushRef) {});
							const nowTS = new Date().getTime();
							let lastBlockTime = nowTS;
							if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime > 1500508800000) {
								lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID)][JSE.blockID].startTime;
							} else if (typeof JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1] !== 'undefined' && JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime > 1500508800000) {
								lastBlockTime = JSE.currentChain[JSE.jseDataIO.getBlockRef(JSE.blockID-1)][JSE.blockID-1].startTime + 30000;
							}
							let timeTillConfirmation = (lastBlockTime + 30000) - nowTS;
							if (timeTillConfirmation > 30000) timeTillConfirmation = 30000;
							if (timeTillConfirmation < 0) timeTillConfirmation = 29999;
							callback4('{"success":1,"value":"' + coinObject.value + '","notification":"Import Successful","timeTillConfirmation":'+timeTillConfirmation+'}');
						});
					}
				},  function(failObject) {
					callback4('{"fail":1,"notification":"Check User failed"}');
				});
				return false;
			}, function(failObject) {
				callback4('{"fail":1,"notification":"Import Failed: Coin code not recognized"}');
			});
		}, function() {
			callback4('{"fail":1,"notification":"Import Failed: User public key credentials could not be matched"}');
		});
	},

};

module.exports = jseCommands;
