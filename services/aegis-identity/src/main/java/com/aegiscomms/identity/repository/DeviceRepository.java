package com.aegiscomms.identity.repository;

import com.aegiscomms.identity.model.Device;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DeviceRepository extends JpaRepository<Device, String> {
    List<Device> findByUserIdAndIsActive(String userId, boolean isActive);
    List<Device> findByUserId(String userId);
    long countByUserIdAndIsActive(String userId, boolean isActive);
}
