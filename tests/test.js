const fs = require('fs');
const {readId3} = require('../');

const mo = map => {
	const o = Object.create(null);
	map.forEach((value, key) => {
		o[key] = value;
	});
	return o;
};

const sampleFilePath = './mp3/sample.mp3';
if(fs.existsSync(sampleFilePath) === false){
	throw new Error('./mp3/sample.mp3 does not exist!');
}


test('get frames which the tag has', async done => {
	const {TIT2, TPE1, TPE2} = mo(await readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2']));
	
	expect(TPE2.text).toBe('mainartist');
	expect(TPE1.text).toBe('artist1/artist2');
	expect(TIT2.text).toBe('I am a title');
	done();
});

test('the frames object should only contain the asked frames', async done => {
	const frames = await readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2']);
	expect(frames.size).toBe(3);
	done();
});

test('get frames which the tag does not have (testing proxy)', async done => {
	const {TIT2, TPE1, TPE2, TXYZ} = mo(await readId3(sampleFilePath, ['TIT2', 'TPE1', 'TPE2', 'TXYZ']));
	expect(TPE2.text).toBe('mainartist');
	expect(TPE1.text).toBe('artist1/artist2');
	expect(TIT2.text).toBe('I am a title');
	expect(TXYZ).toBe(undefined);
	done();
});

test('get all frames', async done => {
	const frames = await readId3(sampleFilePath);
	expect(frames.size).toBe(4);
	console.log(mo(frames));
	const {TPE1, TPE2, TIT2, TXYZ} = mo(frames);
	expect(TPE2.text).toBe('mainartist');
	expect(TPE1.text).toBe('artist1/artist2');
	expect(TIT2.text).toBe('I am a title');
	expect(TXYZ).toBe(undefined);
	done();
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