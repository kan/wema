use inc::Module::Install;

name 'Wema';
version '3.0';

requires 'Plack';
requires 'Twiggy';
requires 'Protocol::WebSocket';

WriteAll;
