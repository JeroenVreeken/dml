#ifndef _INCLUDE_TRX_DV_H_
#define _INCLUDE_TRX_DV_H_

#include <stdlib.h>
#include <stdint.h>

int trx_dv_init(char *dev, int (*in_cb)(void *arg, uint8_t from[6], uint8_t *dv, size_t size, int mode), void *arg);

#endif /* _INCLUDE_TRX_DV_H_ */
