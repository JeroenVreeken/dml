/*
	Copyright Jeroen Vreeken (jeroen@vreeken.net), 2021

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
#ifndef _INCLUDE_DML_LOG_H_
#define _INCLUDE_DML_LOG_H_

#include <stdbool.h>
#include <stdio.h>

enum dml_log_level {
	DML_LOG_ERROR,
	DML_LOG_WARNING,
	DML_LOG_INFO,
	DML_LOG_DEBUG,
};

void dml_log(enum dml_log_level, const char *fmt, ...);

void dml_log_level(enum dml_log_level);
void dml_log_fp(FILE *fp);
void dml_log_syslog(bool);


#endif // _INCLUDE_DML_LOG_H_
