package bookapp.bookappback.userbookstatus.controller;

import bookapp.bookappback.userbookstatus.entity.ReadingStatus;
import bookapp.bookappback.userbookstatus.entity.UserBookStatus;
import bookapp.bookappback.userbookstatus.service.UserBookStatusService;
import bookapp.bookappback.userbookstatus.dto.UserLibraryResponse; // Import the new DTO
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/library")
@RequiredArgsConstructor
public class UserBookStatusController {

    private final UserBookStatusService userBookStatusService;

    @PostMapping("/{bookId}")
    public ResponseEntity<UserBookStatus> updateBookStatus(
            @AuthenticationPrincipal UserDetails userDetails,
            @PathVariable Long bookId,
            @RequestParam ReadingStatus status) {
        String userEmail = userDetails.getUsername(); // Get email from UserDetails
        UserBookStatus updatedStatus = userBookStatusService.updateStatus(userEmail, bookId, status);
        return ResponseEntity.ok(updatedStatus);
    }

    @GetMapping
    public ResponseEntity<UserLibraryResponse> getLibrary(
            @AuthenticationPrincipal UserDetails userDetails) {
        String userEmail = userDetails.getUsername(); // Get email from UserDetails
        UserLibraryResponse userLibrary = userBookStatusService.getUserLibrary(userEmail);
        return ResponseEntity.ok(userLibrary);
    }

    @GetMapping("/all")
    public ResponseEntity<Map<Long, List<Long>>> getAllUserLibraries() {
        Map<Long, List<Long>> allUserLibraries = userBookStatusService.getAllUserLibraries();
        return ResponseEntity.ok(allUserLibraries);
    }
}