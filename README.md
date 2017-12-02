# Stream ID3
A fast & easy-to-use library for reading ID3.

## Demo
```javascript
const {readId3} = require('stream-id3');

readId3('music.mp3', ['TIT2', 'TPE1']).then(frames => {
	console.log({
		artist: frames.get('TPE1').value,
		title: frames.get('TIT2').value
	});
});
```

## Installation
`npm install stream-id3`