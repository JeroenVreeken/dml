include build.mk

CFLAGS += -g -Wall -Werror -O3
LDFLAGS += -lcrypto -lm

DML_SRCS = \
	dml_client.c \
	dml_config.c \
	dml_connection.c \
	dml_crypto.c \
	dml_id.c \
	dml_packet.c \
	dml_poll.c \
	dml_route.c \
	dml_server.c \
	dml_stream.c \
	dml_stream_client_simple.c

TRX_SRCS = \
	trx_dv.c

DML_OBJS = $(DML_SRCS:.c=.o)
TRX_OBJS = $(TRX_SRCS:.c=.o)

all: dmld dml_list dml_reflector dml_streamer dml_stream_client dml_trx dml_httpd

SRCS += $(DML_SRCS) $(TRX_SRCS)

SRCS += dmld.c
dmld: $(DML_OBJS) dmld.o

SRCS += dml_list.c
dml_list: $(DML_OBJS) dml_list.o

SRCS += dml_reflector.c alaw.c
dml_reflector_LDFLAGS += -lcodec2 -leth_ar
dml_reflector: $(DML_OBJS) $(TRX_OBJS) dml_reflector.o alaw.o

SRCS += dml_trx.c trx_sound.c alaw.c
dml_trx_LDFLAGS += -lasound -lcodec2 -leth_ar
dml_trx: $(DML_OBJS) $(TRX_OBJS) dml_trx.o alaw.o

SRCS += dml_streamer.c matroska.c ogg.c
dml_streamer: $(DML_OBJS) dml_streamer.o matroska.o ogg.o

SRCS += dml_stream_client.c
dml_stream_client: $(DML_OBJS) dml_stream_client.o

SRCS += dml_httpd.c
dml_httpd_LDFLAGS += -lwebsockets -lmagic
dml_httpd: $(DML_OBJS) dml_httpd.o

DEPS:=$(SRCS:.c=.d)
-include $(DEPS)

OBJS+=$(SRCS:.c=.o)

$(OBJS): Makefile

clean:
	rm -rf $(OBJS) $(DEPS) \
		dml_list \
		dml_reflector \
		dml_streamer \
		dml_stream_client \
		dml_trx

