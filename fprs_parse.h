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

#ifndef _INCLUDE_FPRS_PARSE_H_
#define _INCLUDE_FPRS_PARSE_H_

#include <time.h>
#include <stdint.h>

#define FPRS_PARSE_UPLINK 0x1
#define FPRS_PARSE_DOWNLINK 0x2

int fprs_parse_data(void *data, size_t size, struct timespec *recv_time, unsigned int link,
    time_t t_valid,
    int (*cb)(void *data, size_t size, unsigned int link, void *arg),
    void *arg);

int fprs_parse_request_flush(
    int (*cb)(void *data, size_t size, unsigned int link, void *arg),
    void *arg);

/* cb must return zero in order to claim a message as handled. */
int fprs_parse_hook_message(
    int (*cb)(uint8_t to[6], uint8_t from[6], void *data, size_t dsize, void *id, size_t isize, void *arg),
    void *arg);

#endif /* _INCLUDE_FPRS_PARSE_H_ */
