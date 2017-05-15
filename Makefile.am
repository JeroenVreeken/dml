ACLOCAL_AMFLAGS=-I m4

CFLAGS+= -Wall -Werror -O3


bin_PROGRAMS = dmld dml_list dml_reflector dml_streamer dml_stream_client dml_trx dml_httpd dml_fprs_db

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
	trx_dv.c \
	alaw.c \
	ulaw.c


FPRS_DB_SRCS = \
	fprs_db.c \
	fprs_parse.c \
	fprs_aprsis.c


dmld_SOURCES = $(DML_SRCS) dmld.c
dmld_LDFLAGS = -lcrypto


dml_list_SOURCES = $(DML_SRCS) dml_list.c
dml_list_LDFLAGS = -lcrypto

dml_reflector_SOURCES = $(DML_SRCS) $(TRX_SRCS) dml_reflector.c
dml_reflector_LDFLAGS = -lcodec2 -leth_ar -lm -lcrypto


dml_trx_SOURCES = $(DML_SRCS) $(TRX_SRCS) $(FPRS_DB_SRCS) dml_trx.c
dml_trx_LDFLAGS = -lasound -lcodec2 -leth_ar -lcrypto


dml_streamer_SOURCES = $(DML_SRCS) dml_streamer.c matroska.c ogg.c
dml_streamer_LDFLAGS = -lcrypto


dml_stream_client_SOURCES = $(DML_SRCS) dml_stream_client.c
dml_stream_client_LDFLAGS = -lcrypto


dml_httpd_SOURCES = $(DML_SRCS) dml_httpd.c
dml_httpd_LDFLAGS = -lwebsockets -lmagic -lcrypto

dml_fprs_db_SOURCES = $(DML_SRCS) $(FPRS_DB_SRCS) dml_fprs_db.c
dml_fprs_db_LDFLAGS = -leth_ar -lm -lcrypto
