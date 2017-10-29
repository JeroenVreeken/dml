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
#ifndef _INCLUDE_DML_POLL_H_
#define _INCLUDE_DML_POLL_H_

#include <time.h>
#include <stdbool.h>
#include <poll.h>

int dml_poll_add(void *arg,
    int (*in_cb)(void *arg),
    int (*out_cb)(void *arg),
    int (*time_cb)(void *arg)
);
int dml_poll_add_multiple(void *arg,
    int (*in_cb)(void *arg),
    int (*out_cb)(void *arg),
    int (*time_cb)(void *arg),
    short (*revents_cb)(void *arg, struct pollfd *fds, int count),
    int nr_fds,
    struct pollfd **fds
);
int dml_poll_remove(void *arg);
int dml_poll_fd_set(void *arg, int fd);
int dml_poll_in_set(void *arg, bool enable);
int dml_poll_out_set(void *arg, bool enable);
int dml_poll_timeout(void *arg, struct timespec *ts);
int dml_poll_loop(void);

#endif /* _INCLUDE_DML_POLL_H_ */
