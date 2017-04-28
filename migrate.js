const mongoose = require('mongoose');
const mongodbUri = require('mongodb-uri');
const natural = require('natural');
const config = require('config');
const models = require('./models');

const metaphone = natural.Metaphone;
const soundex = natural.SoundEx;

const locations = require('./data/locations.json');
const measurements = require('./data/measurements.json');
const products = require('./data/products.json');
const productMeasurements = require('./data/product_measurements.json');

const Location = models.Location;
const Measurement = models.Measurement;
const Product = models.Product;

mongoose.connect(mongodbUri.format({
    username: config.get('mongodb_username'),
    password: config.get('mongodb_password'),
    hosts: [{ host: config.get('mongodb_host'), port: config.get('mongodb_port') }],
    database: config.get('mongodb_database'),
}));

// initial upload
locations.forEach((location, index) => { Location(location).save() });
measurements.forEach((measurement, index) => { Measurement(measurement).save() });
products.forEach((product, index) => { Product(product).save() });

// product to measurements
productMeasurements.forEach((pm) => {
    let measurements = [];

    Measurement.findOne({ code: pm.measurement_code }).exec((err, doc) => { if (doc) measurements.push(doc._id) }).then(() => { 
        Measurement.findOne({ code: "MEASUREMENT_KILOGRAM" }).exec((err, doc) => { if (doc) measurements.push(doc._id) }).then(() => {
            Product.update({ code: pm.product_code }, { measurements: measurements }).exec();
        });
    });
});

// product phonics
var productCursor = Product.find({}).cursor();
productCursor.on('data', function(doc) { 
    doc.soundex = soundex.process(doc.name);
    doc.metaphone = metaphone.process(doc.name);
    doc.save((err) => { if (err) console.log(err)});
});

// location phonetics
locationCursor = Location.find({}).cursor();
locationCursor.on('data', function(doc) { 
    doc.soundex = soundex.process(doc.name);
    doc.metaphone = metaphone.process(doc.name);
    doc.save((err) => { if (err) console.log(err)});
});
