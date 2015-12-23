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
#include "trx_control.h"
#include "dml_poll.h"

#include <stdlib.h>
#include <termios.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

#define TRX_CONTROL_BUFFER_SIZE 128

struct trx_control {
	int fd;
	
	char buffer[TRX_CONTROL_BUFFER_SIZE];
	int pos;
	
	bool state;
	
	int (*command_cb)(char *command);
	int (*state_cb)(bool state);
};

static int in_cb(void *arg)
{
	struct trx_control *tc = arg;
	
	ssize_t r = read(tc->fd, tc->buffer + tc->pos, 1);
	if (r > 0) {
		if (tc->buffer[tc->pos] == '#') {
			tc->buffer[tc->pos] = 0;
			tc->command_cb(tc->buffer);
			tc->pos = -1;
		} else if (tc->buffer[tc->pos] == '*') {
			tc->pos = -1;
		} else if (tc->buffer[tc->pos] == '\n') {
			tc->state = !tc->state;
			tc->state_cb(tc->state);
			tc->pos = -1;
		}
		tc->pos++;
		
		if (tc->pos >= TRX_CONTROL_BUFFER_SIZE - 1)
			tc->pos = 0;
	}
	
	return 0;
}

int trx_control_init(char *device, int(*cmd_cb)(char*), int(*state_cb)(bool))
{
	struct trx_control *tc;
	
	tc = calloc(1, sizeof(struct trx_control));
	if (!tc)
		goto err_calloc;
	
	if (!device)
		tc->fd = 0;
	else {
		tc->fd = open(device, O_RDONLY);
		if (tc->fd < 0)
			goto err_open;
	}
	
	tc->command_cb = cmd_cb;
	tc->state_cb = state_cb;

	struct termios tio;

	tcgetattr(tc->fd, &tio);
	/* disable canonical mode (buffered i/o) and local echo */
	tio.c_lflag &=(~ICANON & ~ECHO);
	tcsetattr(tc->fd, TCSANOW, &tio);

	if (dml_poll_add(tc, in_cb, NULL, NULL))
		goto err_poll;
	dml_poll_fd_set(tc, tc->fd);
	dml_poll_in_set(tc, true);

	return 0;
err_poll:
	close(tc->fd);
err_open:
	free(tc);
err_calloc:
	return -1;
}
