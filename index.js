'use strict';
const express = require('express');
const mongoose = require('mongoose');
const mongodbUri = require('mongodb-uri');
const natural = require('natural');
const config = require('config');
const BootBot = require('bootbot');
const models = require('./models')
const functions = require('./functions')

// NPL
const metaphone = natural.Metaphone;
const soundex = natural.SoundEx;

// MongoDB
const Location = models.Location;
const Measurement = models.Measurement;
const Product = models.Product;
const Offer = models.Offer;
const User = models.User;

mongoose.connect(mongodbUri.format({
    username: config.get('mongodb_username'),
    password: config.get('mongodb_password'),
    hosts: [{ host: config.get('mongodb_host'), port: config.get('mongodb_port') }],
    database: config.get('mongodb_database'),
}));

var db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() { /* we're connected! */ });

// Messenger Bot
var bot = new BootBot({
    accessToken: config.get('access_token'),
    verifyToken: config.get('verify_token'),
    appSecret: config.get('app_secret')
});

var defaults = { typing: true }
var app = bot.app;

app.use(express.static(__dirname + '/static'))

// Questions
const askOfferType = (convo) => {
    let options = [
        'What would you like to do?',
        'Can I help you buy or sell?',
        'Would you like to buy or sell?'
    ]
    const quickBuySell = [
        { content_type: "text", title: "Buy", payload: "BUY" }, 
        { content_type: "text", title: "Sell", payload: "SELL" }
    ];
    convo.ask({ text: functions.random_text(options), quickReplies: quickBuySell }, (payload, convo) => {
        // determine what user means if not "buy" or "sell"

    }, [
        { event: 'quick_reply', callback: () => { convo.set('offer_type', payload.message.quick_reply.payload); askProducts(convo); }},
        { pattern: ['buy'], callback: () => { convo.set('offer_type', "BUY"); askProducts(convo); }},
        { pattern: ['sell'], callback: () => { convo.set('offer_type', "SELL"); askProducts(convo); }}
    ], defaults);
};

const askProducts = (convo) => {
    let type = convo.get('offer_type');

    convo.ask(`What do you want to ${type.toLowerCase()}?`, (payload, convo) => {
        let query = payload.message.text;
        Product.find({
            $or: [
                { name: { $regex: `^${query}$`, $options: 'i' }}, 
                { singular: { $regex: `^${query}$`, $options: 'i' }}, 
                { plural: { $regex: `^${query}$`, $options: 'i' }}, 
                { soundex: soundex.process(query) }, 
                { metaphone: metaphone.process(query) }
            ]
        }).limit(8).exec((err, products) => {
            convo.set('products', products);
            let options = [
                "Great! I've found some products. Take a look.",
                "Here are some options based on your search."
            ];
            if (products.length) convo.say(functions.random_text(options)).then(() => { 
                convo.ask((convo) => askProductsList(convo), (payload, convo) => { 
                        // determine what user means if typed in value
                    }, [
                        { event: 'postback', callback: (payload, convo) => {
                            Product.findOne({ code: payload.postback.payload }).exec((err, product) => {
                                convo.set('offer_product', product);
                                askProductMeasurement(convo);
                            });
                        }}
                    ], defaults);
                })
            else {
                let options = [
                    `Sorry, I can't find ${query}. Try again?`,
                    `Whoops! I didn't find ${query}. Would you like to try again?`
                ];
                convo.ask(functions.random_text(options), (payload, convo) => {
                    let options = [
                        "Sorry, I couldn't understand you. Let's start over.",
                        "Opps... I forgot where we were. Let's try this again.",
                    ];
                    convo.say(functions.random_text(options), defaults).then(() => saySorry(convo));
                }, [
                    { pattern: ['ok', 'yes', 'y', 'yep'], callback: (payload, convo) => { 
                        let options = ['Great!', "Let's try again.", 'No problem.']; 
                        askProducts(convo); 
                    }},
                    { pattern: ['no', 'n', 'nope'], callback: (payload, convo) => { 
                        let options = ['OK', 'Cool', 'No problem.']; 
                        convo.say(functions.random_text(options)).then(() => { sayGoodBye(convo) }) ;
                    }},
                ], defaults);
            }
        });
    }, [], defaults);
}

const askProductsList = (convo) => {
    let products = [];
    let type = convo.get('offer_type');

    convo.get('products').forEach((product, index) => {
        products.push({
            title: product.name, 
            buttons: [{ type: "postback", title: `${functions.capitalize(type)} ${product.name.toLowerCase()}`, payload: product.code }],
            image_url: functions.image_url(`/products/${product.code}.jpg`)
        });
    });
    convo.sendGenericTemplate(products, { topElementStyle: 'compact', imageAspectRatio: 'horizontal', typing: true });
}

const askOffersList = (convo) => {
    let offers = [];

    convo.get('offers').forEach((offer, index) => {
        User.findOne({ _id: offer.user }, (err, usr) => {
            Product.findOne({ _id: offer.product }, (err, prd) => {
                Measurement.findOne({ _id: offer.measurement }, (err, msr) => {
                    Location.findOne({ _id: offer.fromLocation}, (err, lct) => {
                        offers.push({
                            title: `${usr.firstName} ${usr.lastName}`, 
                            subtitle: `Wants to ${offer.type.toLowerCase()} ${offer.quantity} ${msr.plural} of ${prd.plural.toLowerCase()} in ${lct.name}.`,
                            buttons: [{ type: "phone_number", title: "Call", payload: usr.phone }],
                            image_url: usr.pictureUrl
                        });
                    });
                });
            });
        });
    });
    convo.sendGenericTemplate(offers, { topElementStyle: 'compact', imageAspectRatio: 'square', typing: true });
}

const askProductMeasurement = (convo) => {
    let product = convo.get('offer_product');
    let type = convo.get('offer_type');

    let quickMeasurements = [];
    Measurement.find({ _id: { $in: product.measurements } }).exec((err, measurements) => {
        measurements.forEach((measurement, index) => {
            quickMeasurements.push({ content_type: "text", title: measurement.name, payload: measurement.code });
        })

        convo.ask({ text: `What size, unit, or measurement of ${product.name.toLowerCase()} do you want to ${type.toLowerCase()}?`, quickReplies: quickMeasurements }, (payload, convo) => {
            // handle what user means if typed in value
        }, [
            { event: 'quick_reply', callback: (payload, convo) => {
                Measurement.findOne({ code: payload.message.quick_reply.payload }).exec((err, measurement) => {
                    convo.set('offer_measurement', measurement);
                    askProductQuantity(convo);
                });
            }}
        ], defaults);
    });
}

const askProductQuantity = (convo) => {
    let product = convo.get('offer_product');
    let measurement = convo.get('offer_measurement');

    convo.ask(`How many ${measurement.plural.toLowerCase()} of ${product.plural.toLowerCase()}?`, (payload, convo) => {
        // handle what user means if typed in value
    }, [
        { pattern: [/^\d+$/], callback: (payload, convo) => {
            convo.set('offer_quantity', payload.message.text);
            askProductLocation(convo);
        }}
    ], defaults);
}

const askProductLocation = (convo) => {
    let type = convo.get('offer_type');
    let product = convo.get('offer_product');

    convo.ask({ text: `Where do you want to ${type.toLowerCase()} ${product.plural.toLowerCase()}?`, quickReplies: [{ content_type: 'location' }] }, (payload, convo) => {
        if (payload.message.attachments) {
            let location = payload.message.attachments[0].payload.coordinates;

            Location.find({ 
                point: { 
                    $near: { 
                        $maxDistance: 5000, 
                        $geometry: { type: 'Point', coordinates: [location.long, location.lat] }
                    }
                }
            }).limit(8).exec((err, nearby_locations) => {
                if (nearby_locations.length) {
                    let quickLocations = [];
                    nearby_locations.forEach((nearby_location, index) => {
                        quickLocations.push({ content_type: "text", title: nearby_location.name, payload: nearby_location.code });
                    });

                    let options = [
                        "I've found some places nearby. Choose the closest to you.",
                        "Here are a few locations close to you. Which one are you in?"
                    ];
                    convo.ask({ text: functions.random_text(options), quickReplies: quickLocations }, (payload, convo) => {
                        // determine what user means if typed in value
                    }, [
                        { event: 'quick_reply', callback: (payload, convo) => {
                            Location.findOne({ code: payload.message.quick_reply.payload }).exec((err, nearby_location) => {
                                convo.set('offer_fromLocation', nearby_location);
                                convo.set('offer_fromPoint', { type: 'Point', coordinates: [location.long, location.lat] });
                                convo.set('offer_toLocation', nearby_location);
                                convo.set('offer_toPoint', { type: 'Point', coordinates: [location.long, location.lat] });
                                askProductPrice(convo);
                            });
                        }}
                    ], defaults);
                }
            });
        }
    }, [], defaults);
}

const askProductPrice = (convo) => {
    let type = convo.get('offer_type');
    let product = convo.get('offer_product');
    let quantity = convo.get('offer_quantity');
    let measurement = convo.get('offer_measurement');

    convo.ask(`How much (in US Dollars) are you willing to ${type.toLowerCase()} ${quantity} ${measurement.plural} of ${product.plural.toLowerCase()} for?`, (payload, convo) => {
        // handle what user means if typed in value
    }, [
        { pattern: [/^\d+(\.\d+)?$/], callback: (payload, convo) => {
            convo.set('offer_price', payload.message.text);
            let price = convo.get('offer_price');
            
            if (!convo.get('offer_user')) {
                convo.say("We've been chatting for a while and have not actually exchanged details.", defaults).then(() => askUserPhone(convo));
            } else saveOffer(convo);
        }}
    ], defaults)
}

const askUserPhone = (convo) => {
    let user = convo.get('user');

    convo.ask('Can I have your phone number?', (payload, convo) => {
        let phone = payload.message.text.replace(/[^-+\s\d()]/g, '');
        if (phone) {
            user.phone = phone;
            convo.set('user', user);
            askUserEmail(convo);
        } else convo.say('Sorry, I did not get that. Please try again.', defaults).then(() => { askUserPhone(convo) });
    }, [], defaults);
}

const askUserEmail = (convo) => {
    let user = convo.get('user');
    
    convo.ask('Can I have your email address?', (payload, convo) => {
        let email = /\S+@\S+\.\S+/.exec(payload.message.text);
        if (email) {
            user.email = email;
            convo.set('user', user);
            saveUser(convo);
        } else convo.say('Sorry, I did not get that. Please try again.', defaults).then(() => { askUserEmail(convo) });
    }, [], defaults);
}

// Saving

const saveUser = (convo) => {
    let user = convo.get('user');
    
    let newUser = new User({
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        email: user.email,
        asid: null,
        psid: convo.userId,
        pictureUrl: user.profile_pic,
        gender: user.gender
    });
    newUser.save();
    convo.set('offer_user', newUser); 
    saveOffer(convo); 
}

const saveOffer = (convo) => {
    let type = convo.get('offer_type');
    let product = convo.get('offer_product');
    let quantity = convo.get('offer_quantity');
    let measurement = convo.get('offer_measurement');
    let price = convo.get('offer_price');
    let fromLocation = convo.get('offer_fromLocation');
    let fromPoint = convo.get('offer_fromPoint');
    let toLocation = convo.get('offer_toLocation');
    let toPoint = convo.get('offer_toPoint');
    let user = convo.get('offer_user');

    let offer = new Offer({
        type: type,
        product: product._id,
        price: price,
        quantity: quantity,
        measurement: measurement._id,
        fromLocation: fromLocation._id,
        fromPoint: fromPoint,
        toLocation: toLocation._id,
        toPoint: toPoint,
        user: user._id
    });
    offer.save();
    convo.say("Great! let's see if I can find what you're looking for...").then(() => findOffers(convo, offer));
}

// Searching

const findOffers = (convo, match) => {
    let offer_user = convo.get('offer_user');

    Offer.find({
        $and: [
            { type: match.type == 'BUY' ? 'SELL' : 'BUY' }, 
            { product: match.product }, 
            // { price: match.type == 'BUY' ? { $lt: match.price + (match.price * 0.25) } : { $gt: match.price - (match.price * 0.25) }}, 
            // { quantity: { $lt: match.quantity + (match.quantity * 0.25), $gt: match.quantity - (match.quantity * 0.25) }}, 
            // { measurement: match.measurement },
            // { fromPoint: { 
            //     $near: { 
            //         $maxDistance: 5000, 
            //         $geometry: { type: 'Point', coordinates: match.fromPoint }
            //     }
            // }},
            // { toPoint: { 
            //     $near: { 
            //         $maxDistance: 5000, 
            //         $geometry: { type: 'Point', coordinates: [match.fromPoint.coordinates.long, match.fromPoint.coordinates.lat] }
            //     }
            // }},
            // { user: { $ne: offer_user._id }}
        ]
    }).limit(8).exec((err, offers) => {
        convo.set('offers', offers);

        let options = [
            "I've found some offers nearby.",
            "Here are some options based on your search."
        ];

        if (offers.length) {
            convo.say(functions.random_text(options)).then(() => { 
                convo.ask((convo) => askOffersList(convo), (payload, convo) => { 
                        // determine what user means if typed in value
                    }, [
                        { event: 'postback', callback: (payload, convo) => {
                            Offer.findOne({ _id: payload.postback.payload }).exec((err, offer) => {
                                convo.set('offer_match', offer);
                                // create match connect them via phone, email, etc.
                            });
                        }}
                    ], defaults);
                })
        } else {
            convo.say("Sorry, I wasn't able to find a match.").then(() => sayGoodBye(convo));
        }
    });    
}

// Statements
const saySorry = (convo) => {
    let options = [
        "Sorry, I couldn't understand you. Let's start over.",
        "Opps... I forgot where we were. Let's try this again.",
    ];
    convo.set('user', user);
    User.findOne({ psid: convo.userId }, (err, doc) => {
        if (doc) convo.set('offer_user', doc);
        else convo.set('offer_user', null);
        convo.say(functions.random_text(options), defaults).then(() => askOfferType(convo));
    });
}

const sayGoodBye = (convo) => {
    let options = [
        "Thanks for the chat!",
        "See you next time.",
        "Talk to you later!"
    ];
    convo.say(functions.random_text(options), defaults);
    convo.end();
}

const sayOffer = (convo) => {
    convo.say(`Offer is to ${convo.get('offer_type')} ${convo.get('offer_quantity')} ${convo.get('offer_measurement')} of ${convo.get('offer_produce')}`);
    convo.end();
}

// Listeners

bot.hear(['hi', 'hello', 'hey', 'whats up'], (payload, chat) => {
    let options = [
        'Hey!', 
        'Welcome back.'
    ];
    let convo = chat.conversation((convo) => {});
    convo.getUserProfile().then((user) => {
        convo.set('user', user);
        User.findOne({ psid: convo.userId }, (err, doc) => {
            if (doc) convo.set('offer_user', doc);
            else convo.set('offer_user', null);
            convo.say(functions.random_text(options), defaults).then(() => askOfferType(convo));
        });      
    });
})

bot.hear(['bye', 'good bye', 'later'], (payload, chat) => {
    let convo = chat.conversation((convo) => {});
    sayGoodBye(convo);
})

bot.on('message', (payload, chat, data) => {
    let convo = chat.conversation((convo) => {});
    if (data.captured == false) saySorry(convo);    
});

bot.on('postback:GET_STARTED', (payload, chat) => {
    let convo = chat.conversation();
    convo.getUserProfile().then((user) => {
        convo.set('user', user);
        convo.say('Hi', defaults).then(() => {
            convo.say('My name is Agrobot', defaults).then(() => {
                convo.say("I'm here to help you buy and sell agricultural produce by connecting you to local producers or consumers.", defaults).then(() => {
                    convo.say("I can do a lot for a bot, but just remember, I'm not a real person. So, let's get started!", defaults).then(() => askOfferType(convo))
                });
            });
        });
    });
});

bot.setGreetingText('Connects buyers and sellers of agricultural products and services.');
bot.setGetStartedButton('GET_STARTED');

bot.start(3000);