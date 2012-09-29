#!/usr/bin/env perl

use strict;
use warnings;

use AnyEvent::Handle;
use Protocol::WebSocket::Handshake::Server;
use Protocol::WebSocket::Frame;
use Plack::Request;
use JSON qw();
use Data::UUID::Base64URLSafe;

my $db = {};
my %member;
my $id = 1;

my $psgi_app = sub {
    my $env = shift;

    my $fh = $env->{'psgix.io'} or return [500, [], []];

    my $hs = Protocol::WebSocket::Handshake::Server->new_from_psgi($env);
    $hs->parse($fh) or return [400, [], [$hs->error]];

    return sub {
        my $respond = shift;

        my $h = AnyEvent::Handle->new(fh => $fh);
        my $cv = AnyEvent::condvar;
        my $frame = Protocol::WebSocket::Frame->new;

        $member{fileno($fh)} = $h;

        $h->push_write($hs->to_string);

        $h->on_read(
            sub {
                $frame->append($_[0]->rbuf);

                while (my $message = $frame->next) {
                    warn $message;
                    my $json = JSON::decode_json($message);
                    unless ($json->{tagId}) {
                        $json->{tagId} = Data::UUID::Base64URLSafe->new->create_b64_urlsafe;
                    }


                    $db->{$json->{tagId}} = $json;
                    my $msg = Protocol::WebSocket::Frame->new(JSON::encode_json($json))->to_bytes;
                    $_->push_write($msg) for values %member;
                }
            }
        );

        $h->on_error(
            sub {
                my ($hdl, $fatal, $msg) = @_;
                delete $member{fileno($fh)};
                $hdl->destroy;
                $cv->send;
                undef $h;
            }
        );

        $h->on_eof(
            sub {
                my ($hdl) = @_;
                delete $member{fileno($fh)};
                $hdl->destroy;
                $cv->send;
                undef $h;
            }
        );
    };
};


$psgi_app;
