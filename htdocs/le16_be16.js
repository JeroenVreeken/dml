/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2019

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

function le16() 
{
	this.decode = function (arraybuffer) {
		var u8_view = new Uint8Array(arraybuffer);
		var i;
		var s_buf = new Array(u8_view.length/2);
		
		for (i = 0; i < u8_view.length/2; i++) {
			var a_val_lo = u8_view[i*2+0];
			var a_val_hi = u8_view[i*2+1];
			var s_val;
			
			s_val = a_val_hi * 256 + a_val_lo;
			if (s_val >= 32768)
				s_val -= 65536;
			
			s_buf[i] = s_val / 32767;
		}
		
		return s_buf;
	}
}

function be16() 
{
	this.decode = function (arraybuffer) {
		var u8_view = new Uint8Array(arraybuffer);
		var i;
		var s_buf = new Array(u8_view.length/2);
		
		for (i = 0; i < u8_view.length/2; i++) {
			var a_val_lo = u8_view[i*2+1];
			var a_val_hi = u8_view[i*2+0];
			var s_val;
			
			s_val = a_val_hi * 256 + a_val_lo;
			if (s_val >= 32768)
				s_val -= 65536;
			
			s_buf[i] = s_val / 32767;
		}
		
		return s_buf;
	}
}
