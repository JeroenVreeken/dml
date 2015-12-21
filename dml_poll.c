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
#include "dml_poll.h"

#include <poll.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

struct dml_poll {
	struct dml_poll *next;

	int pfd_nr;

	void *arg;
	int (*in_cb)(void *arg);
	int (*out_cb)(void *arg);
	int (*time_cb)(void *arg);
	time_t timeout;
};

static struct dml_poll *dml_poll_list;

static struct pollfd *pfds = NULL;
static nfds_t nfds = 0;

int dml_poll_add(void *arg,
    int (*in_cb)(void *arg),
    int (*out_cb)(void *arg),
    int (*time_cb)(void *arg)
)
{
	struct dml_poll *dp;
	int pfd_nr;

//	printf("+add: %p\n", arg);
	for (dp = dml_poll_list; dp; dp = dp->next) {
		if (dp->arg == arg)
			break;
	}
	if (!dp) {
		pfds = realloc(pfds, sizeof(struct pollfd) * (nfds + 1));
		pfd_nr = nfds;
		memset(pfds + pfd_nr, 0, sizeof(struct pollfd));
		pfds[pfd_nr].fd = -1;
		nfds++;
	
		dp = calloc(1, sizeof(struct dml_poll));
		dp->pfd_nr = pfd_nr;
		dp->arg = arg;

		dp->next = dml_poll_list;
		dml_poll_list = dp;
	}
	dp->in_cb = in_cb;
	dp->out_cb = out_cb;
	dp->time_cb = time_cb;
	
//	printf("=add: %p\n", dp);
	
	return 0;
}

int dml_poll_remove(void *arg)
{
	struct dml_poll **dp;
	int pfd_nr = -1;
	
	for (dp = &dml_poll_list; *dp; dp = &(*dp)->next) {
		if ((*dp)->arg == arg) {
			struct dml_poll *old = *dp;
			
			pfd_nr = old->pfd_nr;
			
			*dp = old->next;
			free(old);
			break;
		}
	}
//	printf("remove prd_nr %d %d\n", (int)pfd_nr, (int) nfds);
	if (pfd_nr < 0)
		return 0;
	for (dp = &dml_poll_list; *dp; dp = &(*dp)->next) {
//		printf("- %p %d\n", *dp, (*dp)->pfd_nr);
		if ((*dp)->pfd_nr > pfd_nr)
			(*dp)->pfd_nr--;
	}
	memmove(pfds + pfd_nr, pfds + pfd_nr + 1, sizeof(*pfds) * (nfds - pfd_nr - 1));
	nfds--;
	pfds = realloc(pfds, sizeof(*pfds) * nfds);
	
	return 0;
}

int dml_poll_fd_set(void *arg, int fd)
{
	struct dml_poll *dp;
	
	for (dp = dml_poll_list; dp; dp = dp->next) {
		if (dp->arg == arg)
			pfds[dp->pfd_nr].fd = fd;
	}
	return 0;
}

int dml_poll_in_set(void *arg, bool enable)
{
	struct dml_poll *dp;
	
	for (dp = dml_poll_list; dp; dp = dp->next) {
		if (dp->arg == arg) {
			pfds[dp->pfd_nr].events &= ~POLLIN;
			pfds[dp->pfd_nr].events |= enable ? POLLIN : 0;
		}
	}
	return 0;
}

int dml_poll_out_set(void *arg, bool enable)
{
	struct dml_poll *dp;
	
	for (dp = dml_poll_list; dp; dp = dp->next) {
		if (dp->arg == arg) {
			pfds[dp->pfd_nr].events &= ~POLLOUT;
			pfds[dp->pfd_nr].events |= enable ? POLLOUT : 0;
		}
	}
	return 0;
}

int dml_poll_timeout(void *arg, struct timespec *ts)
{
	struct dml_poll *dp;
	
	for (dp = dml_poll_list; dp; dp = dp->next) {
		if (dp->arg == arg) {
			dp->timeout = ts->tv_sec;
			dp->timeout += ts->tv_nsec ? 1 : 0;
			dp->timeout += time(NULL);
//			printf("set timeout %d\n", (int)dp->timeout);
		}
	}
	return 0;
}

int dml_poll_loop(void)
{
	do {
		time_t t = 0;
		struct dml_poll *dp;
		
		for (dp = dml_poll_list; dp; dp = dp->next) {
			if (dp->timeout) {
				if (t)
					t = t > dp->timeout ? dp->timeout : t;
				else
					t = dp->timeout;
			}
//			printf("%d %d\n", (int)dp->timeout, (int)t);
		}
	
		int timeout;
		
		if (t) {
			timeout = 1000 * (t - time(NULL));
			if (timeout < 0)
				timeout = 0;
		} else {
			timeout = -1;
		}
		
//		printf("Poll with %d fds and timeout: %d\n", (int)nfds, timeout);
		poll(pfds, nfds, timeout);
		
		for (dp = dml_poll_list; dp; dp = dp->next) {
			struct pollfd *p = &pfds[dp->pfd_nr];
//			printf("%p %p nr: %d fd: %d\n", dp, dp->arg, (int)dp->pfd_nr, p->fd);
			
			if (p->fd >= 0) {
//				printf("%p %d: %x %x\n", dp, dp->pfd_nr, p->revents, p->events);
				if (p->revents & POLLIN) {
					dp->in_cb(dp->arg);
					break;
				}
				if (p->revents & POLLOUT) {
					dp->out_cb(dp->arg);
					break;
				}
			}
			if (dp->timeout) {
				if (dp->timeout <= time(NULL)) {
					dp->timeout = 0;
					dp->time_cb(dp->arg);
					break;
				}
			}
		}
	} while (1);

	return 0;
}
