/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2016

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

function ulaw() 
{
	this.decode = function (arraybuffer) {
		var u8_view = new Uint8Array(arraybuffer);
		var i;
		var s_buf = new Array(u8_view.length);
		
		for (i = 0; i < u8_view.length; i++) {
			var u_val = u8_view[i];
			var s_val;
			
			/* Complement to obtain normal u-law value. */
			u_val = ~u_val;

			/*
			 * Extract and bias the quantization bits. Then
			 * shift up by the segment number and subtract out the bias.
			 */
			t = ((u_val & 0xf) << 3) + 0x84;
			t <<= (u_val & 0x70) >> 4;

			s_val = ((u_val & 0x80) ? (0x84 - t) : (t - 0x84));

			s_buf[i] = s_val / 32767;
		}
		
		return s_buf;
	}
}
