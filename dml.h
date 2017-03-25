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
#ifndef _INCLUDE_DML_H_
#define _INCLUDE_DML_H_

#include <stdint.h>
#include <stdbool.h>
#include <time.h>

#define DML_VERSION "0.2"

#define DML_ID_SIZE	32
#define DML_SIG_SIZE	((256 * 2) / 8)
#define DML_TIME_MARGIN	60

#define DML_MIME_DV_C2 "audio/dml-codec2"
#define DML_MIME_FPRS "application/fprs"
#define DML_ALIAS_FPRS_DB "DB"
#define DML_ALIAS_FPRS_BACKBONE "BACKBONE"

static inline uint64_t dml_ts2timestamp(struct timespec *ts)
{
	uint64_t timestamp;
	
	timestamp = (((uint64_t)ts->tv_sec) << 16) | ((uint64_t)ts->tv_nsec*65536)/1000000000;

	return timestamp;
}

static inline void dml_timestamp2ts(struct timespec *ts, uint64_t timestamp)
{
	ts->tv_nsec = ((timestamp & 0xffff) * 1000000000) / 65536;
	ts->tv_sec = timestamp >> 16;
}

static inline uint64_t dml_timestamp_add(uint64_t timestamp, struct timespec *ts)
{
	struct timespec org;
	
	dml_timestamp2ts(&org, timestamp);
	
	org.tv_sec += ts->tv_sec;
	org.tv_nsec += ts->tv_nsec;
	if (org.tv_nsec >= 1000000000) {
		org.tv_sec++;
		org.tv_nsec -= 1000000000;
	}

	return dml_ts2timestamp(&org);
}

#endif /* _INCLUDE_DML_H_ */
