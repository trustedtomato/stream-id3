const fs = require('fs');

const sampleFilePath = './mp3/sample.mp3';
const tests = 30000;
if(fs.existsSync(sampleFilePath) === false){
	throw new Error(sampleFilePath + ' does not exist!');
}


(async function(){

	console.time('id3 startup time');
	const readId3 = require('../').readId3;
	console.timeEnd('id3 startup time');
	
	console.time('musicmetadata startup time');
	const mm = require('musicmetadata');
	console.timeEnd('musicmetadata startup time');

	console.time('id3 partial performance');
	for(let i = 0; i < tests; i++){
		await readId3(sampleFilePath, ['TIT2', 'TALB']);
	}
	console.timeEnd('id3 partial performance');

	console.time('id3 whole performance');
	for(let i = 0; i < tests; i++){
		await readId3(sampleFilePath);
	}
	console.timeEnd('id3 whole performance');

	console.time('musicmetadata performance');
	for(let i = 0; i < tests; i++){
		await new Promise((resolve, reject) => {
			const stream = fs.createReadStream(sampleFilePath);
			mm(stream, err => {
				stream.close();
				if(err){
					reject(err);
				}else{
					resolve();
				}
			});
		});
	}
	console.timeEnd('musicmetadata performance');
})();