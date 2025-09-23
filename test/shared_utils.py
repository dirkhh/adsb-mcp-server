#!/usr/bin/env python3
"""
Shared utilities for test scripts
"""

from typing import Tuple


def get_remote_host_and_port() -> Tuple[str, int]:
    """Get the remote host and port from the user with sensible defaults"""
    remote_host = input("Enter the IP address or hostname of your ADS-B feeder (default is adsb-feeder.local): ").strip()
    if not remote_host:
        remote_host = "adsb-feeder.local"

    port_input = input("Enter the port (default 8080): ").strip()
    remote_port = int(port_input) if port_input else 8080

    return remote_host, remote_port
