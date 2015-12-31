/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2015

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
#ifndef _INCLUDE_TRX_SOUND_H_
#define _INCLUDE_TRX_SOUND_H_

int trx_sound_init(char *dev_name);
int trx_sound_in_cb_set(int (*cb)(void *arg, int16_t *samples, int nr), void *arg);
int trx_sound_out(void *arg, int16_t *samples, int nr);


#endif /* _INCLUDE_TRX_SOUND_H_ */
