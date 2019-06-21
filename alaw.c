/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2019

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

#include "alaw.h"
#include <stdint.h>
#include <stdlib.h>
#include <math.h>


uint8_t *alaw_beep(double freq, double rate, double length)
{
	int samples = length * rate;
	uint8_t *buffer = malloc(samples);
	int16_t raw[samples];
	int i;
	
	if (!buffer)
		return NULL;
	
	for (i = 0; i < samples; i++) {
		raw[i] = 16384 * sin(i * M_PI * 2 * freq / rate);
	}
	alaw_encode(buffer, raw, samples);
	
	return buffer;
}

uint8_t *alaw_silence(double rate, double length)
{
	int samples = length * rate;
	uint8_t *buffer = malloc(samples);
	int16_t raw[samples];
	int i;
	
	if (!buffer)
		return NULL;
	
	for (i = 0; i < samples; i++) {
		raw[i] = 0;
	}
	alaw_encode(buffer, raw, samples);

	return buffer;
}
