
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
