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

#include <endian.h>
#include <alsa/asoundlib.h>

static short revents_cb(void *arg, struct pollfd *fds, int count)
{
	snd_pcm_t *pcm_handle = arg;
	unsigned short revents;
	
	snd_pcm_poll_descriptors_revents(pcm_handle, fds, count, &revents);

	return revents;
}

snd_pcm_t *pcm_handle_out = NULL;

int trx_sound_out(void *arg, int16_t *samples, int nr)
{
	int r;
	
	r = snd_pcm_writei(pcm_handle_out, samples, nr);

	if (r <= 0) {
		snd_pcm_recover(pcm_handle_out, r, 0);
	}

	return 0;
}

static int (*pcm_in_cb)(void *arg, int16_t *samples, int nr);
static void *pcm_in_cb_arg;

static int in_cb(void *arg)
{
	snd_pcm_t *pcm_handle = arg;
	int r;
	int16_t samples[8000/50];
	
	r = snd_pcm_readi(pcm_handle, samples, 8000/50);

	if (r > 0) {
		pcm_in_cb(pcm_in_cb_arg, samples, r);
	} else {
		snd_pcm_recover(pcm_handle, r, 0);
		snd_pcm_start(pcm_handle);
	}
	
	return 0;
}

int trx_sound_in_cb_set(int (*cb)(void *arg, int16_t *samples, int nr), void *arg)
{
	pcm_in_cb = cb;
	pcm_in_cb_arg = arg;
	
	return 0;
}

static int trx_sound_params(snd_pcm_t *pcm_handle)
{
	snd_pcm_hw_params_t *hw_params;
	snd_pcm_hw_params_malloc (&hw_params);

	printf("Set parameters\n");
	snd_pcm_hw_params_any(pcm_handle, hw_params);
	snd_pcm_hw_params_set_access (pcm_handle, hw_params, SND_PCM_ACCESS_RW_INTERLEAVED);

	if (htole16(0x1234) == 0x1234)
		snd_pcm_hw_params_set_format (pcm_handle, hw_params, SND_PCM_FORMAT_S16_LE);
	else
		snd_pcm_hw_params_set_format (pcm_handle, hw_params, SND_PCM_FORMAT_S16_BE);
	
	unsigned int rrate = 8000;
	
	snd_pcm_hw_params_set_rate_near (pcm_handle, hw_params, &rrate, NULL);
	snd_pcm_hw_params_set_channels (pcm_handle, hw_params, 1);

	snd_pcm_uframes_t buffer_size = (rrate / 50) * 20;
	snd_pcm_uframes_t period_size = rrate / 50;

	snd_pcm_hw_params_set_buffer_size_near (pcm_handle, hw_params, &buffer_size);
	snd_pcm_hw_params_set_period_size_near (pcm_handle, hw_params, &period_size, NULL);

	snd_pcm_hw_params (pcm_handle, hw_params);

	snd_pcm_hw_params_free (hw_params);


	snd_pcm_sw_params_t *sw_params;

	snd_pcm_sw_params_malloc (&sw_params);
	snd_pcm_sw_params_current (pcm_handle, sw_params);

	snd_pcm_sw_params_set_start_threshold(pcm_handle, sw_params, buffer_size - period_size);
	snd_pcm_sw_params_set_avail_min(pcm_handle, sw_params, period_size);

	snd_pcm_sw_params(pcm_handle, sw_params);

	snd_pcm_prepare (pcm_handle);

	return 0;
}

int trx_sound_init(void)
{
	int err;
	snd_pcm_t *pcm_handle_in = NULL;

	/* The device name */
	const char *device_name = "default"; 

	/* Open the device */
	printf("Open sound device for input: %s\n", device_name);
	err = snd_pcm_open (&pcm_handle_in, device_name, SND_PCM_STREAM_CAPTURE, 0);
	if (err < 0)
		return -1;

	if (trx_sound_params(pcm_handle_in))
		return -1;

	printf("Open sound device for output: %s\n", device_name);
	err = snd_pcm_open (&pcm_handle_out, device_name, SND_PCM_STREAM_PLAYBACK, 0);
	if (err < 0)
		return -1;

	if (trx_sound_params(pcm_handle_out))
		return -1;

	int nr_fds = snd_pcm_poll_descriptors_count(pcm_handle_in);
	struct pollfd *fds;
	printf("Add %d descriptors to poll\n", nr_fds);
	if (dml_poll_add_multiple(pcm_handle_in, in_cb, NULL, NULL, revents_cb, nr_fds, &fds))
	{
		return -1;
	}
	printf("Fill in poll descriptors\n");
	if (snd_pcm_poll_descriptors(pcm_handle_in, fds, nr_fds) < 0)
		return -1;

	snd_pcm_start(pcm_handle_in);

	return 0;
}
