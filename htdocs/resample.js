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


function resample()
{
	/* Simple conversion, simply sample the original array... 
	   Works well if the rates are related or if factor is high */
	this.convert = function resample_convert(buffer_in, rate_in, rate_out) {
		var buffer_out = new Array();
		var i;
		var len_out = buffer_in.length * rate_out / rate_in;
		
		for (i = 0; i < len_out; i++) {
			var s_in = Math.floor(i * rate_in / rate_out);
			
			buffer_out[i] = buffer_in[s_in];
		}
		
		return buffer_out;
	}
}
