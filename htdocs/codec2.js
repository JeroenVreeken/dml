var CODEC2 = {
	MODE: {
		0: '3200',
		1: '2400',
		2: '1600',
		3: '1400',
		4: '1300',
		5: '1200',
		6: '700',
		7: '700B',
	}
};

function codec2()
{
	var codec2_this = this;
	this.mode = -1;
	this.c2 = 0;
	
	this.create = function(mode) {
		if (codec2_this.mode == mode)
			return;
		codec2_this.destroy();
		codec2_this.mode = mode;
		
		codec2_this.c2 = Module._codec2_create(mode);
		codec2_this.bits_per_frame = Module._codec2_bits_per_frame(codec2_this.c2);
		codec2_this.bytes_per_frame = (codec2_this.bits_per_frame + 7) >> 3;
		codec2_this.samples_per_frame = Module._codec2_samples_per_frame(codec2_this.c2);
		codec2_this.c2_buf = Module._malloc(codec2_this.bytes_per_frame);
		codec2_this.c2_snd = Module._malloc(codec2_this.samples_per_frame * 2);
	}

	this.decode = function(code)
	{
		var snd = new Array();
		var pos = 0;

		while (pos < code.length) {
			var i;
			
			for (i = 0; i < codec2_this.bytes_per_frame; i++) {
//				console.log(i + " " + code[pos]);
				Module.setValue(
				    codec2_this.c2_buf + i,
				    code[pos],
				    'i8'
				);
				pos++;
			}
			
			Module._codec2_decode(codec2_this.c2, codec2_this.c2_snd, codec2_this.c2_buf);

			for (i = 0; i < codec2_this.samples_per_frame; i++) {
				var sample = Module.getValue(
				    codec2_this.c2_snd + (i*2), 'i16'
				);
				
				snd.push(sample / 32767);
//				console.log(i + " " + sample + " " + snd[i]);
			}
		}
		
		return snd;
	}

	this.destroy = function() {
		if (codec2_this.c2) {
			Module._free(codec2_this.c2_buf);
			Module._free(codec2_this.c2_snd);
			
			Module._codec2_destroy(codec2_this.c2);
		}
		codec2_this.c2 = 0;
		codec2_this.c2_buf = 0;
		codec2_this.c2_snd = 0;	
		codec2_this.mode = -1;
	}
}

