const config = require('config');

var base_url = () => `${config.get('scheme')}://${config.get('host')}:${(config.get('port')?':'+config.get('port'):'')}${config.get('path')}`;
var image_url = (path) => `${base_url()}/images${path}`;
var capitalize = (string) => string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
var random_text = (options) => options[Math.floor(Math.random()*options.length)];

module.exports = {
    base_url: base_url,
    image_url: image_url,
    capitalize: capitalize,
    random_text: random_text
}
