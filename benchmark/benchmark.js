(async function(){
	const fs = require('fs');

	console.time('id3 startup time');
	const id3 = require('../').streamTag;
	console.timeEnd('id3 startup time');
	
	console.time('musicmetadata startup time');
	const mm = require('musicmetadata');
	console.timeEnd('musicmetadata startup time');

	console.time('id3 partial performance');
	for(let i = 0; i < 1000; i++){
		await id3('./mp3/music.mp3', ['TIT2', 'TALB']);
	}
	console.timeEnd('id3 partial performance');

	console.time('id3 whole performance');
	for(let i = 0; i < 1000; i++){
		await id3('./mp3/music.mp3', ['ASDF', 'TALB']);
	}
	console.timeEnd('id3 whole performance');

	console.time('musicmetadata performance');
	for(let i = 0; i < 1000; i++){
		await new Promise((resolve, reject) => {
			const stream = fs.createReadStream('./mp3/music.mp3');
			mm(stream, err => {
				stream.close();
				if(err){
					reject(err);
				}else{
					resolve();
				}
			});
		});
		await id3('./mp3/music.mp3', ['ASDF', 'TALB']);
	}
	console.timeEnd('musicmetadata performance');
})();