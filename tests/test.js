const fs = require('fs');
const {readId3} = require('../');

const sampleFilePath = './mp3/sample.mp3';
if(fs.existsSync(sampleFilePath) === false){
	throw new Error('./mp3/sample.mp3 does not exist!');
}


test('get frames which the tag has', async done => {
	const {TIT2, TPE1, TPE2} = await readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2']);
	
	expect(TPE2.value).toBe('mainartist');
	expect(TPE1.value).toBe('artist1/artist2');
	expect(TIT2.value).toBe('I am a title');
	done();
});

test('the frames object should only contain the asked frames', async done => {
	const frames = await readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2']);
	expect(Object.keys(frames).length).toBe(3);
	done();
});

test('get frames which the tag does not have (testing proxy)', done => {
	readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2', 'TXYZ']).then(({TIT2, TPE1, TPE2, TXYZ}) => {
		expect(TPE2.value).toBe('mainartist');
		expect(TPE1.value).toBe('artist1/artist2');
		expect(TIT2.value).toBe('I am a title');
		expect(TXYZ.value).toBe(undefined);
		done();
	});
});

test('get all frames', done => {
	readId3(sampleFilePath).then(frames => {
		expect(Object.keys(frames).length).toBe(4);
		const {TPE1, TPE2, TIT2, TXYZ} = frames;
		expect(TPE2.value).toBe('mainartist');
		expect(TPE1.value).toBe('artist1/artist2');
		expect(TIT2.value).toBe('I am a title');
		expect(TXYZ.value).toBe(undefined);
		done();
	});
});

test('get the parser', done => {
	let frames = [];
	readId3(sampleFilePath, true)
		.on('frame', frame => {
			frames.push(frame);
		})
		.on('end', () => {
			expect(frames.length).toBe(4);
			done();
		});
});