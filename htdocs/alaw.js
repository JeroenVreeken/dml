/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

 */

function alaw() 
{
	this.decode = function (arraybuffer) {
		var u8_view = new Uint8Array(arraybuffer);
		var i;
		var s_buf = new Array(u8_view.length);
		
		for (i = 0; i < u8_view.length; i++) {
			var a_val = u8_view[i];
			var t;
			var seg;
			var s_val;
			
			a_val ^= 0x55;
			t = a_val & 0x7f;
			if (t < 16) {
				t = (t << 4) + 8;
			} else {
				seg = (t >> 4) & 0x07;
				t = ((t & 0x0f) << 4) + 0x108;
				t <<= seg - 1;
			}
			s_val = ((a_val & 0x80) ? t : -t);
			
			s_buf[i] = s_val / 32767;
		}
		
		return s_buf;
	}
}
