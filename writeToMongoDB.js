const { MongoClient } = require('mongodb');
require('dotenv').config();

async function writeToMongoDB(collectionName, data) {
    const uri = process.env.mongodb;
    const client = new MongoClient(uri);

    await client.connect();
    const database = client.db(process.env.dbName);
    const collection = database.collection(collectionName);
    await collection.insertOne(data);
    await client.close();
};

module.exports = writeToMongoDB;