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

#include <dml/dml_log.h>

#include <stdarg.h>
#include <stdio.h>
#include <syslog.h>

static int dml_log_min = DML_LOG_INFO;
static bool dml_log_use_syslog = false;
static FILE *dml_log_file = NULL;

static char *dml_log_level2str(enum dml_log_level level)
{
	switch (level) {
		case DML_LOG_ERROR:
			return "ERROR:  ";
		case DML_LOG_WARNING:
			return "WARNING:";
		case DML_LOG_INFO:
			return "INFO:   ";
		case DML_LOG_DEBUG:
			return "DEBUG:  ";
	}
	
	return "unknown";
}

static int dml_log_level2syslog(enum dml_log_level level)
{
	int prio = LOG_DAEMON;

	switch (level) {
		case DML_LOG_ERROR:
			prio |= LOG_ERR;
			break;
		case DML_LOG_WARNING:
			prio |= LOG_WARNING;
			break;
		case DML_LOG_INFO:
			prio |= LOG_INFO;
			break;
		case DML_LOG_DEBUG:
			prio |= LOG_DEBUG;
			break;
	}
	
	return prio;
}


void dml_log(enum dml_log_level level, const char *fmt, ...)
{
	if (level > dml_log_min)
		return;

	va_list ap;
	va_start(ap, fmt);
	
	if (dml_log_use_syslog) {
		vsyslog(dml_log_level2syslog(level), fmt, ap);
	} else {
		if (!dml_log_file)
			dml_log_file = stdout;
	
		fprintf(dml_log_file, "%s", dml_log_level2str(level));
		vfprintf(dml_log_file, fmt, ap);
	}
	
	va_end(ap);
}

void dml_log_level(enum dml_log_level level)
{
	dml_log_min = level;
}

void dml_log_fp(FILE *fp)
{
	dml_log_file = fp;
}

void dml_log_syslog(bool value)
{
	dml_log_use_syslog = value;
}

