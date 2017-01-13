/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016, 2017

	@licstart  The following is the entire license notice for the 
	JavaScript code in this page.

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

	@licend  The above is the entire license notice
	for the JavaScript code in this page.
 */

var CODEC2 = {
	MODE: {
		0: 'CODEC2_MODE_3200',
		1: 'CODEC2_MODE_2400',
		2: 'CODEC2_MODE_1600',
		3: 'CODEC2_MODE_1400',
		4: 'CODEC2_MODE_1300',
		5: 'CODEC2_MODE_1200',
		6: 'CODEC2_MODE_700',
		7: 'CODEC2_MODE_700B',
		8: 'CODEC2_MODE_700C',
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

