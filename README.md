# Stream ID3
A fast & easy-to-use library for reading ID3.

## Demo
```javascript
const {readId3} = require('stream-id3');

readId3('music.mp3', ['TIT2', 'TPE1']).then(({TIT2, TPE1}) => {
	console.log({
		artist: TPE1.value,
		title: TIT2.value
	});
});
```

## Installation
`npm install stream-id3`