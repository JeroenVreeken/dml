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

#ifndef _INCLUDE_FPRS_APRSIS_H_
#define _INCLUDE_FPRS_APRSIS_H_


int fprs_aprsis_init(char *host, int port, char *mycall, bool req_msg, void (*msg_cb)(struct fprs_frame *));
int fprs_aprsis_frame(struct fprs_frame *frame, uint8_t *from);


#endif /* _INCLUDE_FPRS_APRSIS_H_ */
