const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, unique: true },
    email: { type: String, unique: true },
    asid: { type: String, unique: true },
    psid: { type: String, unique: true },
    gender: String,
    pictureUrl: String
});

const offerSchema = new Schema({
    type: { type: String, required: true },
    product: { type: Schema.Types.ObjectId, required: true },
    price: Number,
    quantity: Number,
    user: Schema.Types.ObjectId,
    measurement: Schema.Types.ObjectId,
    fromPoint: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true }
    },
    toPoint: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true }
    },
    fromLocation: Schema.Types.ObjectId,
    toLocation: Schema.Types.ObjectId,
    matched: { type: Boolean, default: false },
    options: Schema.Types.Mixed
});
offerSchema.index({ fromPoint: '2dsphere' });
offerSchema.index({ toPoint: '2dsphere' });

const productSchema = new Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    description: String,
    type: { type: String, required: true },
    singular: String,
    plural: String,
    soundex: String,
    metaphone: String,
    image: String,
    measurements: [Schema.Types.ObjectId]
});

const measurementSchema = new Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    symbol: String,
    singular: String,
    plural: String,
});

const locationSchema = new Schema({
    name: { type: String, required: true },
    other_names: [String],
    code: { type: String, required: true, unique: true },
    city: String,
    region: String,
    country: String,
    soundex: String,
    metaphone: String,
    longitude: { type: Number, required: true },
    latitude: { type: Number, required: true },
    point: {
        type: { type: String, default: 'Point' },
        coordinates: { type: [Number], required: true }
    }
});
locationSchema.index({ point: '2dsphere' });

module.exports = {
    User: mongoose.model('User', userSchema),
    Offer: mongoose.model('Offer', offerSchema),
    Product: mongoose.model('Product', productSchema),
    Measurement: mongoose.model('Measurement', measurementSchema),
    Location: mongoose.model('Location', locationSchema),
}

