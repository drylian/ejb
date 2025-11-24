export function md5(input: string): string {
	// Constants
	const SHIFT = [
		[7, 12, 17, 22],
		[5, 9, 14, 20],
		[4, 11, 16, 23],
		[6, 10, 15, 21],
	];

	const T: number[] = [];
	let i = 0;
	while (i < 64) {
		T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
		i++;
	}

	// Helper functions
	const rotateLeft = (value: number, shift: number) =>
		(value << shift) | (value >>> (32 - shift));

	const addUnsigned = (x: number, y: number) => {
		const lsw = (x & 0xffff) + (y & 0xffff);
		const msw = (x >>> 16) + (y >>> 16) + (lsw >>> 16);
		return (msw << 16) | (lsw & 0xffff);
	};

	// Convert string to word array
	const msg = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p) =>
		String.fromCharCode(parseInt(p, 16)),
	);

	const msgLen = msg.length;
	const blockCount = ((msgLen + 8) >>> 6) + 1;
	const words = new Array(blockCount * 16).fill(0);

	i = 0;
	while (i < msgLen) {
		words[i >>> 2] |= msg.charCodeAt(i) << ((i % 4) * 8);
		i++;
	}

	words[msgLen >>> 2] |= 0x80 << ((msgLen % 4) * 8);
	words[blockCount * 16 - 2] = msgLen * 8;

	// Initialize hash
	let a = 0x67452301,
		b = 0xefcdab89,
		c = 0x98badcfe,
		d = 0x10325476;

	// Process blocks
	let block = 0;
	while (block < words.length) {
		const chunk = words.slice(block, block + 16);
		let [aa, bb, cc, dd] = [a, b, c, d];

		// Round 1
		i = 0;
		while (i < 16) {
			const f = (bb & cc) | (~bb & dd);
			const g = i;
			aa = addUnsigned(aa, addUnsigned(addUnsigned(f, chunk[g]), T[i]));
			aa = rotateLeft(aa, SHIFT[0][i % 4]);
			aa = addUnsigned(aa, bb);
			[aa, bb, cc, dd] = [dd, aa, bb, cc];
			i++;
		}

		// Round 2
		i = 0;
		while (i < 16) {
			const f = (dd & bb) | (~dd & cc);
			const g = (5 * i + 1) % 16;
			aa = addUnsigned(aa, addUnsigned(addUnsigned(f, chunk[g]), T[i + 16]));
			aa = rotateLeft(aa, SHIFT[1][i % 4]);
			aa = addUnsigned(aa, bb);
			[aa, bb, cc, dd] = [dd, aa, bb, cc];
			i++;
		}

		// Round 3
		i = 0;
		while (i < 16) {
			const f = bb ^ cc ^ dd;
			const g = (3 * i + 5) % 16;
			aa = addUnsigned(aa, addUnsigned(addUnsigned(f, chunk[g]), T[i + 32]));
			aa = rotateLeft(aa, SHIFT[2][i % 4]);
			aa = addUnsigned(aa, bb);
			[aa, bb, cc, dd] = [dd, aa, bb, cc];
			i++;
		}

		// Round 4
		i = 0;
		while (i < 16) {
			const f = cc ^ (bb | ~dd);
			const g = (7 * i) % 16;
			aa = addUnsigned(aa, addUnsigned(addUnsigned(f, chunk[g]), T[i + 48]));
			aa = rotateLeft(aa, SHIFT[3][i % 4]);
			aa = addUnsigned(aa, bb);
			[aa, bb, cc, dd] = [dd, aa, bb, cc];
			i++;
		}

		a = addUnsigned(a, aa);
		b = addUnsigned(b, bb);
		c = addUnsigned(c, cc);
		d = addUnsigned(d, dd);

		block += 16;
	}

	// Convert to hex
	const toHex = (value: number) => {
		let hex = "";
		let j = 0;
		while (j < 4) {
			const byte = (value >>> (j * 8)) & 0xff;
			hex += (byte < 16 ? "0" : "") + byte.toString(16);
			j++;
		}
		return hex;
	};

	return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}
